import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RequestsService } from '../requests/requests.service';

const REQUEST_INCLUDE = {
  company: true,
  department: true,
  requester: true,
  requestData: true,
  workflowInstance: true,
} as const;

@Injectable()
export class WarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestsService: RequestsService,
  ) {}

  async findPendingClassification() {
    return this.prisma.request.findMany({
      where: { status: 'PENDING_WAREHOUSE' },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOneForClassification(id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    return request;
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
