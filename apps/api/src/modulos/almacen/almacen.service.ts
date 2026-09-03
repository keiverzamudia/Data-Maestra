import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { SolicitudesService } from '../solicitudes/solicitud.service';
import { flattenRequestData } from '../../comun/utilidades/flatten-request-data';

const REQUEST_INCLUDE = {
  company: true,
  department: true,
  requester: true,
  requestData: true,
  workflowInstance: true,
  approvals: {
    include: { actor: { select: { id: true, username: true, displayName: true } } },
    orderBy: { createdAt: 'desc' },
  },
} as const;

@Injectable()
export class AlmacenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestsService: SolicitudesService,
  ) {}

  async findPendingClassification() {
    const rows = await this.prisma.request.findMany({
      where: { status: 'PENDIENTE_ALMACEN' },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(flattenRequestData);
  }

  async findOneForClassification(id: string) {
    const raw = await this.prisma.request.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });

    if (!raw) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    return flattenRequestData(raw);
  }

  async classify(id: string, data: Record<string, unknown>, userId: string, companyId: string) {
    const request = await this.findOneForClassification(id);

    if (request.status !== 'PENDIENTE_ALMACEN' && request.status !== 'ALMACEN_APROBADO') {
      throw new NotFoundException(`Request ${id} is not pending warehouse classification`);
    }

    return this.requestsService.classify(id, data as any, userId, companyId);
  }

  async approve(id: string, userId: string, companyId: string) {
    const request = await this.findOneForClassification(id);

    if (request.status !== 'PENDIENTE_ALMACEN' && request.status !== 'ALMACEN_APROBADO') {
      throw new NotFoundException(`Request ${id} is not pending warehouse classification`);
    }

    // Validate classification exists before advancing
    const requestData = await this.prisma.requestData.findUnique({ where: { requestId: id } });
    if (!requestData || !requestData.groupId || !requestData.subgroupId || !requestData.masterCode) {
      throw new BadRequestException('No se puede enviar a Contabilidad: la clasificación de Almacén está incompleta. Faltan grupo, subgrupo o código master.');
    }

    return this.requestsService.approve(id, { action: 'APPROVE', comment: 'Warehouse classification approved' }, userId, companyId);
  }

  async returnToRequester(id: string, comment?: string, userId?: string, companyId?: string) {
    const request = await this.findOneForClassification(id);

    if (request.status !== 'PENDIENTE_ALMACEN' && request.status !== 'ALMACEN_APROBADO') {
      throw new NotFoundException(`Request ${id} is not pending warehouse classification`);
    }

    return this.requestsService.approve(id, { action: 'RETURN', comment: comment ?? 'Returned to requester' }, userId!, companyId!);
  }
}
