import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RequestsService } from '../requests/requests.service';

const REQUEST_INCLUDE = {
  company: true,
  department: true,
  requester: true,
  requestData: true,
  accountingCodes: true,
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
export class FinalReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestsService: RequestsService,
  ) {}

  async findPendingReview() {
    const rows = await this.prisma.request.findMany({
      where: { status: 'PENDING_FINAL_REVIEW' },
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

    if (request.status !== 'PENDING_FINAL_REVIEW') {
      throw new NotFoundException(`Request ${id} is not pending final review`);
    }

    return this.requestsService.approve(id, { action: 'APPROVE', comment: 'Final review approved' }, userId, companyId);
  }

  async reject(id: string, comment?: string, userId?: string, companyId?: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    if (request.status !== 'PENDING_FINAL_REVIEW') {
      throw new NotFoundException(`Request ${id} is not pending final review`);
    }

    return this.requestsService.approve(id, { action: 'REJECT', comment: comment ?? 'Rejected at final review' }, userId!, companyId!);
  }
}
