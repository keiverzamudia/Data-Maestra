import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

export interface AuditEventFilter {
  entityType?: string;
  entityId?: string;
  actorId?: string;
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
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async findEvents(filter: AuditEventFilter) {
    const where: Record<string, unknown> = {};

    if (filter.entityType) {
      where.entityType = filter.entityType;
    }

    if (filter.entityId) {
      where.entityId = filter.entityId;
    }

    if (filter.actorId) {
      where.actorId = filter.actorId;
    }

    return this.prisma.auditEvent.findMany({
      where,
      include: {
        actor: true,
        actorCompany: true,
      },
      orderBy: { createdAt: 'desc' },
    });
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
