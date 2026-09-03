import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { SolicitudesService } from '../solicitudes/solicitud.service';
import { flattenRequestData } from '../../comun/utilidades/flatten-request-data';

const REQUEST_INCLUDE = {
  company: true,
  department: true,
  requester: true,
  requestData: true,
  accountingCodes: true,
  workflowInstance: true,
} as const;

@Injectable()
export class RevisionFinalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestsService: SolicitudesService,
  ) {}

  async findPendingReview() {
    const rows = await this.prisma.request.findMany({
      where: { status: 'PENDIENTE_VALIDACION_MAESTRA' },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(flattenRequestData);
  }

  async findOneForReview(id: string) {
    const raw = await this.prisma.request.findUnique({
      where: { id },
      include: {
        ...REQUEST_INCLUDE,
        approvals: {
          include: { actor: { select: { id: true, username: true, displayName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!raw) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    return flattenRequestData(raw);
  }

  async approve(id: string, userId: string, companyId: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    if (request.status !== 'PENDIENTE_VALIDACION_MAESTRA') {
      throw new NotFoundException(`Request ${id} is not pending final review`);
    }

    return this.requestsService.approve(id, { action: 'APPROVE', comment: 'Final review approved' }, userId, companyId);
  }

  async reject(id: string, comment?: string, userId?: string, companyId?: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    if (request.status !== 'PENDIENTE_VALIDACION_MAESTRA') {
      throw new NotFoundException(`Request ${id} is not pending final review`);
    }

    return this.requestsService.approve(id, { action: 'REJECT', comment: comment ?? 'Rejected at final review' }, userId!, companyId!);
  }
}
