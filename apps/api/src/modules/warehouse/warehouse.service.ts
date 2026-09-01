import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RequestsService } from '../requests/requests.service';

const REQUEST_INCLUDE = {
  company: true,
  department: true,
  requester: true,
  requestData: true,
  workflowInstance: true,
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenRequestData(raw: any) {
  const { requestData, ...rest } = raw;
  if (!requestData) return rest;
  return {
    ...rest,
    groupId: requestData.groupId,
    subgroupId: requestData.subgroupId,
    categoryId: requestData.categoryId,
    brandId: requestData.brandId,
    unitId: requestData.unitId,
    manufacturer: requestData.manufacturer,
    model: requestData.model,
    partNumber: requestData.partNumber,
    application: requestData.application,
    masterCode: requestData.masterCode,
  };
}

@Injectable()
export class WarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestsService: RequestsService,
  ) {}

  async findPendingClassification() {
    const rows = await this.prisma.request.findMany({
      where: { status: 'PENDING_WAREHOUSE' },
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

    if (request.status !== 'PENDING_WAREHOUSE' && request.status !== 'WAREHOUSE_APPROVED') {
      throw new NotFoundException(`Request ${id} is not pending warehouse classification`);
    }

    return this.requestsService.classify(id, data as any, userId, companyId);
  }

  async approve(id: string, userId: string, companyId: string) {
    const request = await this.findOneForClassification(id);

    if (request.status !== 'PENDING_WAREHOUSE' && request.status !== 'WAREHOUSE_APPROVED') {
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

    if (request.status !== 'PENDING_WAREHOUSE' && request.status !== 'WAREHOUSE_APPROVED') {
      throw new NotFoundException(`Request ${id} is not pending warehouse classification`);
    }

    return this.requestsService.approve(id, { action: 'RETURN', comment: comment ?? 'Returned to requester' }, userId!, companyId!);
  }
}
