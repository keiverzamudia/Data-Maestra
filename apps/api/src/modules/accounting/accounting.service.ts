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

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestsService: RequestsService,
  ) {}

  async findPendingApproval() {
    return this.prisma.request.findMany({
      where: { status: 'PENDING_ACCOUNTING' },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOneForReview(id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    return request;
  }

  async approve(id: string, accountingCodes: Array<{ code: string; description: string }>, userId: string, companyId: string) {
    const request = await this.findOneForReview(id);

    if (request.status !== 'PENDING_ACCOUNTING') {
      throw new NotFoundException(`Request ${id} is not pending accounting approval`);
    }

    if (accountingCodes.length > 0) {
      await this.prisma.requestAccountingCode.createMany({
        data: accountingCodes.map((ac) => ({
          requestId: id,
          code: ac.code,
          description: ac.description,
        })),
      });
    }

    return this.requestsService.approve(id, { action: 'APPROVE', comment: 'Accounting approved' }, userId, companyId);
  }

  async reject(id: string, comment?: string, userId?: string, companyId?: string) {
    const request = await this.findOneForReview(id);

    if (request.status !== 'PENDING_ACCOUNTING') {
      throw new NotFoundException(`Request ${id} is not pending accounting approval`);
    }

    return this.requestsService.approve(id, { action: 'REJECT', comment: comment ?? 'Rejected by accounting' }, userId!, companyId!);
  }
}
