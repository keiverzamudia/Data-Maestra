import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';

export interface AuditEventFilter {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  correlationId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedAuditEvents {
  data: unknown[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateAuditEventData {
  correlationId: string;
  requestId?: string;
  actorId?: string;
  actorCompanyId?: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeData?: string;
  afterData?: string;
  metadata?: string;
}

@Injectable()
export class AuditoriaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 10K — Consulta real de auditoría: filtros server-side + paginación en BD,
   * orden descendente por fecha. Solo lectura: nunca genera eventos.
   * El actor se devuelve con campos seguros (sin passwordHash ni secretos).
   * Si entityType es User, se resuelve el afectado con datos seguros.
   */
  async findEvents(filter: AuditEventFilter): Promise<PaginatedAuditEvents> {
    const where: Record<string, unknown> = {};

    if (filter.entityType) where.entityType = filter.entityType;
    if (filter.entityId) where.entityId = filter.entityId;
    if (filter.actorId) where.actorId = filter.actorId;
    if (filter.action) where.action = filter.action;
    if (filter.correlationId) where.correlationId = filter.correlationId;
    if (filter.search?.trim()) {
      const q = filter.search.trim();
      where.OR = [
        { action: { contains: q } },
        { entityType: { contains: q } },
        { entityId: { contains: q } },
        { correlationId: { contains: q } },
      ];
    }
    if (filter.from || filter.to) {
      const createdAt: Record<string, Date> = {};
      if (filter.from) {
        const d = new Date(filter.from);
        if (!Number.isNaN(d.getTime())) createdAt.gte = d;
      }
      if (filter.to) {
        const d = new Date(filter.to);
        if (!Number.isNaN(d.getTime())) createdAt.lte = d;
      }
      if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
    }

    const page = Math.max(1, Math.floor(filter.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.floor(filter.limit ?? 20)));

    const [total, rows] = await Promise.all([
      this.prisma.auditEvent.count({ where }),
      this.prisma.auditEvent.findMany({
        where,
        select: {
          id: true,
          correlationId: true,
          requestId: true,
          actorId: true,
          actorCompanyId: true,
          entityType: true,
          entityId: true,
          action: true,
          beforeData: true,
          afterData: true,
          createdAt: true,
          actor: { select: { id: true, displayName: true, username: true } },
          actorCompany: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Afectado: si la entidad es un usuario, resolver datos seguros en lote.
    const userIds = Array.from(
      new Set(rows.filter(r => r.entityType === 'User').map(r => r.entityId)),
    );
    const afectados = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true, username: true },
        })
      : [];
    const byId = new Map(afectados.map(u => [u.id, u]));

    return {
      data: rows.map(r => ({ ...r, afectado: byId.get(r.entityId) ?? null })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** Detalle de un evento (misma proyección segura, sin passwordHash). */
  async findEventById(id: string) {
    const row = await this.prisma.auditEvent.findUnique({
      where: { id },
      select: {
        id: true,
        correlationId: true,
        requestId: true,
        actorId: true,
        actorCompanyId: true,
        entityType: true,
        entityId: true,
        action: true,
        beforeData: true,
        afterData: true,
        createdAt: true,
        actor: { select: { id: true, displayName: true, username: true } },
        actorCompany: { select: { id: true, name: true, code: true } },
      },
    });
    if (!row) return null;
    let afectado: unknown = null;
    if (row.entityType === 'User') {
      afectado = await this.prisma.user.findUnique({
        where: { id: row.entityId },
        select: { id: true, displayName: true, username: true },
      });
    }
    return { ...row, afectado };
  }

  async logEvent(data: CreateAuditEventData) {
    return this.prisma.auditEvent.create({
      data: {
        correlationId: data.correlationId,
        requestId: data.requestId,
        actorId: data.actorId,
        actorCompanyId: data.actorCompanyId,
        entityType: data.entityType,
        entityId: data.entityId,
        action: data.action,
        beforeData: data.beforeData,
        afterData: data.afterData,
        metadata: data.metadata ?? '{}',
      },
    });
  }
}
