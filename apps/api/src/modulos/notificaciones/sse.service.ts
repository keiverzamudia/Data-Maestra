import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import type { CreatedNotification } from './notificaciones.service';

export interface SsePayload {
  id: string;
  userId: string;
  requestId: string | null;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
}

/**
 * 12F — Registro en memoria de conexiones SSE por usuario (Map<userId, Set>).
 * Solo conexiones activas; la fuente de verdad es la DB. Sin Redis.
 * Limpieza por unsubscribe (finalize) + cierre de módulo. Sin memory leak.
 */
@Injectable()
export class SseService implements OnModuleDestroy {
  private readonly logger = new Logger(SseService.name);
  private readonly clients = new Map<string, Set<Subject<SsePayload>>>();

  streamFor(userId: string): Observable<SsePayload> {
    const subject = new Subject<SsePayload>();
    let set = this.clients.get(userId);
    if (!set) {
      set = new Set();
      this.clients.set(userId, set);
    }
    set.add(subject);
    this.logger.debug(`SSE conectado: user=${userId} conexiones=${set.size}`);
    const owned = set;
    return subject.asObservable().pipe(
      finalize(() => {
        owned.delete(subject);
        if (owned.size === 0) this.clients.delete(userId);
        this.logger.debug(`SSE desconectado: user=${userId} restantes=${owned.size}`);
      }),
    );
  }

  /** Emite post-commit a todas las pestañas del destinatario. Nunca revierte la tx. */
  emitMany(rows: CreatedNotification[]) {
    for (const n of rows) {
      const set = this.clients.get(n.userId);
      if (!set || set.size === 0) continue;
      const payload: SsePayload = {
        id: n.id,
        userId: n.userId,
        requestId: n.requestId,
        type: n.type,
        title: n.title,
        body: n.body,
        link: n.link,
        createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
      };
      for (const s of set) {
        try {
          s.next(payload);
        } catch {
          /* finalize limpiará */
        }
      }
    }
  }

  /** Solo diagnóstico/tests: conexiones activas por usuario (sin datos). */
  connectionCount(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [userId, set] of this.clients) out[userId] = set.size;
    return out;
  }

  onModuleDestroy() {
    for (const set of this.clients.values()) {
      for (const s of set) {
        try {
          s.complete();
        } catch {
          /* noop */
        }
      }
    }
    this.clients.clear();
  }
}
