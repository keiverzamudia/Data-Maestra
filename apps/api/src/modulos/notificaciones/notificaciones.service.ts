import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';

/**
 * 11G — Permiso de acción que atiende cada cola de workflow.
 * Reglas reales: el mismo permiso exigido por el endpoint que resuelve el paso.
 * PENDIENTE_GERENTE es individual (gerente del departamento), no cola.
 */
const STEP_QUEUE_PERMISSION: Record<string, string> = {
  PENDIENTE_ALMACEN: 'WAREHOUSE.CLASSIFY',
  PENDIENTE_CONTABILIDAD: 'ACCOUNTING.APPROVE',
  PENDIENTE_VALIDACION_MAESTRA: 'FINAL_REVIEW.APPROVE',
};

export interface CreatedNotification {
  id: string;
  userId: string;
  requestId: string | null;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: Date;
}

@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async countUnread(userId: string) {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  /** No leídas posteriores a un evento (reanudación SSE por Last-Event-ID). */
  async findUnreadSince(userId: string, eventId: string) {
    const anchor = await this.prisma.notification.findFirst({ where: { id: eventId, userId } });
    if (!anchor) return this.findUnread(userId);
    return this.prisma.notification.findMany({
      where: { userId, readAt: null, createdAt: { gt: anchor.createdAt } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
  }

  async findUnread(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId, readAt: null },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
  }

  async markAsRead(id: string, userId: string) {
    const res = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (res.count === 0) {
      const exists = await this.prisma.notification.findFirst({ where: { id, userId } });
      if (!exists) throw new NotFoundException('Notificación no encontrada.');
      return { ok: true, alreadyRead: true };
    }
    return { ok: true };
  }

  async markAllAsRead(userId: string) {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, count: res.count };
  }

  async create(data: { userId: string; title: string; body: string; type?: string; link?: string; requestId?: string }) {
    return this.prisma.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        body: data.body,
        type: data.type ?? 'info',
        link: data.link,
        requestId: data.requestId ?? null,
      },
    });
  }

  /**
   * 11G — Resuelve destinatarios de un paso del workflow con las reglas reales:
   * - PENDIENTE_GERENTE → gerente del departamento (individual).
   * - Colas PENDIENTE_* → usuarios activos con membresía activa en la empresa
   *   cuyo rol otorga el permiso de acción del paso, menos overrides DENEGADO,
   *   más overrides CONCEDIDO con membresía en la empresa (misma semántica
   *   que permisos efectivos 10F/10G). Excluye al actor.
   * La arquitectura es cola-por-rol: WorkflowTask.assignedTo permanece null.
   */
  async resolveStepRecipients(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: any,
    opts: { companyId: string; departmentId: string; stepCode: string; excludeUserId?: string },
  ): Promise<string[]> {
    if (opts.stepCode === 'PENDIENTE_GERENTE') {
      const dept = await db.department.findUnique({ where: { id: opts.departmentId } });
      if (!dept?.managerId || dept.managerId === opts.excludeUserId) return [];
      const manager = await db.user.findUnique({ where: { id: dept.managerId } });
      return manager && manager.active ? [manager.id] : [];
    }
    const permission = STEP_QUEUE_PERMISSION[opts.stepCode];
    if (!permission) return [];
    const memberships: any[] = await db.userRole.findMany({
      where: { companyId: opts.companyId, active: true },
      include: { role: { select: { rolePermissions: { select: { permission: { select: { code: true } } } } } } },
    });
    const withRole = new Set<string>(
      memberships
        .filter((m: any) => ((m.role?.rolePermissions ?? []) as any[]).some((rp: any) => rp.permission.code === permission))
        .map((m: any) => m.userId as string),
    );
    const overrides: any[] = await db.userPermissionOverride.findMany({
      where: { permission: { code: permission } },
      include: { permission: { select: { code: true } } },
    });
    const memberUsers = new Set<string>(memberships.map((m: any) => m.userId as string));
    for (const o of overrides) {
      if (o.effect === 'DENEGADO') withRole.delete(o.userId);
      else if (o.effect === 'CONCEDIDO' && memberUsers.has(o.userId)) withRole.add(o.userId);
    }
    withRole.delete(opts.excludeUserId ?? '');
    return Array.from(withRole);
  }

  /**
   * 11G/12F — Crea notificaciones del paso dentro de la transacción del workflow.
   * Idempotencia en dos niveles: (1) filtra destinatarios con no-leída existente;
   * (2) `dedupKey` único por (requestId, type, userId) — una condición de carrera
   * concurrente se resuelve en DB (P2002 ignorado). Retorna las filas creadas para
   * emisión SSE post-commit (nunca dentro de la tx).
   */
  async notifyRequestStep(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    opts: {
      requestId: string;
      requestNumber: string;
      companyId: string;
      departmentId: string;
      stepCode: string;
      actorId: string;
      extraUserIds?: string[];
      title: string;
      body: string;
    },
  ): Promise<CreatedNotification[]> {
    const recipients = new Set([
      ...(await this.resolveStepRecipients(tx, {
        companyId: opts.companyId,
        departmentId: opts.departmentId,
        stepCode: opts.stepCode,
        excludeUserId: opts.actorId,
      })),
      ...(opts.extraUserIds ?? []),
    ]);
    recipients.delete(opts.actorId);
    if (recipients.size === 0) return [];
    const existing = await tx.notification.findMany({
      where: { requestId: opts.requestId, type: opts.stepCode, readAt: null },
      select: { userId: true },
    });
    const seen = new Set(existing.map((e: { userId: string }) => e.userId));
    const fresh = Array.from(recipients).filter(id => !seen.has(id));
    if (fresh.length === 0) return [];
    const created: CreatedNotification[] = [];
    for (const userId of fresh) {
      try {
        const row = await tx.notification.create({
          data: {
            userId,
            requestId: opts.requestId,
            title: opts.title,
            body: opts.body,
            type: opts.stepCode,
            link: `/requester/${opts.requestId}`,
            dedupKey: `${opts.requestId}:${opts.stepCode}:${userId}`,
          },
          select: { id: true, userId: true, requestId: true, type: true, title: true, body: true, link: true, createdAt: true },
        });
        created.push(row);
      } catch (err: any) {
        // P2002 = otro proceso ya creó esta (request, tipo, destinatario).
        if (err?.code !== 'P2002') throw err;
      }
    }
    return created;
  }
}
