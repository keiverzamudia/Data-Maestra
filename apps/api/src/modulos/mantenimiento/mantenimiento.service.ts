import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

export const RESET_CONFIRM_TOKEN = 'BORRAR TODO';

interface DeleteStep {
  table: string;
  label: string;
  count: () => Promise<number>;
  wipe: () => Prisma.PrismaPromise<Prisma.BatchPayload>;
}

export interface ResetPreview {
  tables: Array<{ table: string; label: string; count: number }>;
  total: number;
}

export interface ResetResult {
  deleted: Record<string, number>;
  total: number;
  executedAt: string;
  actorId: string;
}

/**
 * MODO PRUEBAS — Limpieza de datos operativos locales (SQLite dev).
 *
 * Borra SOLICITUDES y su rastro operativo: requests, datos, workflow,
 * aprobaciones, vínculos con Profit, notificaciones y auditoría. Lo derivado
 * de Profit se conserva: catálogos (grupos, subgrupos, categorías, marcas,
 * unidades, visibilidad, configuración de empresas), el universo histórico de
 * matching, los master items y las importaciones. El sistema (empresas,
 * usuarios, roles, permisos y sesiones) nunca se toca.
 *
 * Candados (deny-by-default):
 *   1. Flag ALLOW_TEST_RESET=true (sin él → 403).
 *   2. Nunca en NODE_ENV=production.
 *   3. Confirmación escrita exacta "BORRAR TODO".
 *   4. RBAC ADMIN.MANAGE en el controlador.
 *
 * Profit jamás se toca: solo lecturas/eliminaciones en la SQLite local.
 */
@Injectable()
export class MantenimientoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private assertEnabled() {
    if (this.config.get<string>('ALLOW_TEST_RESET') !== 'true') {
      throw new ForbiddenException('El borrado de pruebas está deshabilitado (ALLOW_TEST_RESET).');
    }
    if ((this.config.get<string>('NODE_ENV') ?? 'development') === 'production') {
      throw new ForbiddenException('El borrado de pruebas nunca se ejecuta en producción.');
    }
  }

  /**
   * Plan de borrado en orden seguro por FKs (hijos → padres).
   * Request y AuditEvent van al final porque concentran referencias.
   */
  private steps(): DeleteStep[] {
    const p = this.prisma;
    return [
      { table: 'workflow_history', label: 'Historial de workflow', count: () => p.workflowHistory.count(), wipe: () => p.workflowHistory.deleteMany() },
      { table: 'workflow_task', label: 'Tareas de workflow', count: () => p.workflowTask.count(), wipe: () => p.workflowTask.deleteMany() },
      { table: 'approval', label: 'Aprobaciones', count: () => p.approval.count(), wipe: () => p.approval.deleteMany() },
      { table: 'request_article_decision', label: 'Decisiones del analizador', count: () => p.requestArticleDecision.count(), wipe: () => p.requestArticleDecision.deleteMany() },
      { table: 'request_article_link', label: 'Vínculos solicitud–Profit', count: () => p.requestArticleLink.count(), wipe: () => p.requestArticleLink.deleteMany() },
      { table: 'request_accounting_code', label: 'Códigos contables', count: () => p.requestAccountingCode.count(), wipe: () => p.requestAccountingCode.deleteMany() },
      { table: 'notification', label: 'Notificaciones', count: () => p.notification.count(), wipe: () => p.notification.deleteMany() },
      { table: 'request_data', label: 'Datos de solicitud', count: () => p.requestData.count(), wipe: () => p.requestData.deleteMany() },
      { table: 'workflow_instance', label: 'Instancias de workflow', count: () => p.workflowInstance.count(), wipe: () => p.workflowInstance.deleteMany() },
      { table: 'request', label: 'Solicitudes', count: () => p.request.count(), wipe: () => p.request.deleteMany() },
      { table: 'audit_event', label: 'Auditoría', count: () => p.auditEvent.count(), wipe: () => p.auditEvent.deleteMany() },
    ];
  }

  /** Vista previa: conteos por tabla sin modificar nada. */
  async preview(): Promise<ResetPreview> {
    this.assertEnabled();
    const tables: ResetPreview['tables'] = [];
    for (const s of this.steps()) {
      // eslint-disable-next-line no-await-in-loop
      const count = await s.count();
      tables.push({ table: s.table, label: s.label, count });
    }
    return { tables, total: tables.reduce((acc, t) => acc + t.count, 0) };
  }

  /** Ejecuta el borrado y deja el evento de auditoría como primer registro. */
  async resetTestData(confirm: string, actorId: string, actorCompanyId?: string): Promise<ResetResult> {
    this.assertEnabled();
    if ((confirm ?? '').trim() !== RESET_CONFIRM_TOKEN) {
      throw new BadRequestException('Confirmación inválida. Escriba BORRAR TODO para ejecutar.');
    }
    const steps = this.steps();
    const results = await this.prisma.$transaction(steps.map((s) => s.wipe()));
    const deleted: Record<string, number> = {};
    steps.forEach((s, i) => {
      deleted[s.table] = results[i]?.count ?? 0;
    });
    const total = Object.values(deleted).reduce((acc, n) => acc + n, 0);
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      actorCompanyId,
      entityType: 'TestDataReset',
      entityId: 'TEST_DATA_RESET',
      action: 'TEST_DATA_RESET_EXECUTED',
      afterData: JSON.stringify({ deleted, total }),
    });
    return { deleted, total, executedAt: new Date().toISOString(), actorId };
  }
}
