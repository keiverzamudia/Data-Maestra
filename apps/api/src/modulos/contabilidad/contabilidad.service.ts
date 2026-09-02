import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
export class ContabilidadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestsService: SolicitudesService,
  ) {}

  async findPendingApproval() {
    const rows = await this.prisma.request.findMany({
      where: { status: 'PENDING_ACCOUNTING' },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(flattenRequestData);
  }

  async findOneForReview(id: string) {
    const raw = await this.prisma.request.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });

    if (!raw) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    return flattenRequestData(raw);
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

    if (!comment || !comment.trim()) {
      throw new BadRequestException('El motivo del rechazo es obligatorio');
    }

    return this.requestsService.approve(id, { action: 'RETURN', comment }, userId!, companyId!);
  }
}
