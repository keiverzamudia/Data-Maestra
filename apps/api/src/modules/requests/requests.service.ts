import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { ClassifyRequestDto } from './dto/classify-request.dto';
import { ApprovalDto } from './dto/approval.dto';

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateRequestDto, userId: string, companyId: string, departmentId: string) {
    const requestNumber = await this.generateRequestNumber();

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          requestNumber,
          companyId,
          departmentId,
          requesterId: userId,
          requestedDescription: dto.requestedDescription,
          purpose: dto.purpose,
          priority: dto.priority ?? 0,
          referencePhotoUri: dto.referencePhotoUri,
          status: 'DRAFT',
        },
      });

      await tx.auditEvent.create({
        data: {
          correlationId: request.id,
          requestId: request.id,
          actorId: userId,
          actorCompanyId: companyId,
          entityType: 'Request',
          entityId: request.id,
          action: 'CREATED',
          afterData: JSON.stringify({
            requestNumber,
            status: 'DRAFT',
            requestedDescription: dto.requestedDescription,
          }),
        },
      });

      return request;
    });
  }

  async findAll(filters: { companyId?: string; status?: string; search?: string }) {
    const where: Record<string, unknown> = {};

    if (filters.companyId) {
      where.companyId = filters.companyId;
    }
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.search) {
      where.OR = [
        { requestNumber: { contains: filters.search } },
        { requestedDescription: { contains: filters.search } },
        { purpose: { contains: filters.search } },
      ];
    }

    return this.prisma.request.findMany({
      where,
      include: {
        company: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
        requester: { select: { id: true, username: true, displayName: true } },
        requestData: true,
        workflowInstance: { select: { id: true, currentStepCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
        requester: { select: { id: true, username: true, displayName: true } },
        requestData: true,
        workflowInstance: {
          include: {
            tasks: {
              include: {
                assignedToUser: { select: { id: true, username: true, displayName: true } },
              },
            },
          },
        },
        approvals: {
          include: { actor: { select: { id: true, username: true, displayName: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    return request;
  }

  async submit(id: string, userId: string, companyId: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    if (request.status !== 'DRAFT') {
      throw new BadRequestException(`Request ${id} is not in DRAFT status`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.request.update({
        where: { id },
        data: { status: 'PENDING_MANAGER' },
      });

      const instance = await tx.workflowInstance.create({
        data: {
          requestId: id,
          currentStepCode: 'PENDING_MANAGER',
          version: 1,
        },
      });

      await tx.workflowTask.create({
        data: {
          instanceId: instance.id,
          stepCode: 'PENDING_MANAGER',
          status: 'PENDING',
        },
      });

      await tx.workflowHistory.create({
        data: {
          instanceId: instance.id,
          fromStep: 'DRAFT',
          toStep: 'PENDING_MANAGER',
          action: 'SUBMIT',
          actorId: userId,
        },
      });

      await tx.approval.create({
        data: {
          requestId: id,
          stepCode: 'PENDING_MANAGER',
          actorId: userId,
          action: 'SUBMIT',
          fromStatus: 'DRAFT',
          toStatus: 'PENDING_MANAGER',
        },
      });

      await tx.auditEvent.create({
        data: {
          correlationId: instance.id,
          requestId: id,
          actorId: userId,
          actorCompanyId: companyId,
          entityType: 'Request',
          entityId: id,
          action: 'SUBMITTED',
          beforeData: JSON.stringify({ status: 'DRAFT' }),
          afterData: JSON.stringify({ status: 'PENDING_MANAGER' }),
        },
      });

      return updated;
    });
  }

  async approve(id: string, dto: ApprovalDto, userId: string, companyId: string) {
    const request = await this.prisma.request.findUnique({
      where: { id },
      include: { workflowInstance: true },
    });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    if (request.status === 'DRAFT' || request.status === 'APPROVED' || request.status === 'REJECTED') {
      throw new BadRequestException(`Request ${id} cannot be processed in ${request.status} status`);
    }

    if ((dto.action === 'REJECT' || dto.action === 'RETURN') && !dto.comment) {
      throw new BadRequestException('Comment is required for REJECT and RETURN actions');
    }

    const nextStatus = this.getNextStatus(request.status, dto.action);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.request.update({
        where: { id },
        data: { status: nextStatus },
      });

      if (request.workflowInstance) {
        await tx.workflowHistory.create({
          data: {
            instanceId: request.workflowInstance.id,
            fromStep: request.status,
            toStep: nextStatus,
            action: dto.action,
            actorId: userId,
            comment: dto.comment,
          },
        });

        await tx.workflowTask.updateMany({
          where: {
            instanceId: request.workflowInstance.id,
            stepCode: request.status,
            status: 'PENDING',
          },
          data: {
            status: dto.action === 'APPROVE' ? 'COMPLETED' : request.status,
            completedAt: dto.action === 'APPROVE' ? new Date() : null,
          },
        });

        await tx.workflowTask.create({
          data: {
            instanceId: request.workflowInstance.id,
            stepCode: nextStatus,
            status: 'PENDING',
          },
        });

        await tx.workflowInstance.update({
          where: { id: request.workflowInstance.id },
          data: { currentStepCode: nextStatus },
        });
      }

      await tx.approval.create({
        data: {
          requestId: id,
          stepCode: request.status,
          actorId: userId,
          action: dto.action,
          fromStatus: request.status,
          toStatus: nextStatus,
          comment: dto.comment,
        },
      });

      await tx.auditEvent.create({
        data: {
          correlationId: request.id,
          requestId: id,
          actorId: userId,
          actorCompanyId: companyId,
          entityType: 'Request',
          entityId: id,
          action: dto.action,
          beforeData: JSON.stringify({ status: request.status }),
          afterData: JSON.stringify({ status: nextStatus }),
        },
      });

      return updated;
    });
  }

  async classify(id: string, dto: ClassifyRequestDto, userId: string, companyId: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    if (request.status !== 'PENDING_WAREHOUSE' && request.status !== 'WAREHOUSE_APPROVED') {
      throw new BadRequestException(`Request ${id} is not in a classifiable status`);
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.requestData.findUnique({ where: { requestId: id } });

      let requestData;
      if (existing) {
        requestData = await tx.requestData.update({
          where: { requestId: id },
          data: {
            groupId: dto.groupId,
            subgroupId: dto.subgroupId,
            categoryId: dto.categoryId,
            brandId: dto.brandId,
            unitId: dto.unitId,
            manufacturer: dto.manufacturer,
            model: dto.model,
            partNumber: dto.partNumber,
            application: dto.application,
          },
        });
      } else {
        requestData = await tx.requestData.create({
          data: {
            requestId: id,
            groupId: dto.groupId,
            subgroupId: dto.subgroupId,
            categoryId: dto.categoryId,
            brandId: dto.brandId,
            unitId: dto.unitId,
            manufacturer: dto.manufacturer,
            model: dto.model,
            partNumber: dto.partNumber,
            application: dto.application,
          },
        });
      }

      const masterCode = await this.generateMasterCode(dto.groupId, dto.subgroupId, tx);

      await tx.requestData.update({
        where: { requestId: id },
        data: { masterCode },
      });

      if (request.status === 'PENDING_WAREHOUSE') {
        await tx.request.update({
          where: { id },
          data: { status: 'WAREHOUSE_APPROVED' },
        });
      }

      await tx.auditEvent.create({
        data: {
          correlationId: request.id,
          requestId: id,
          actorId: userId,
          actorCompanyId: companyId,
          entityType: 'RequestData',
          entityId: requestData.id,
          action: 'CLASSIFIED',
          afterData: JSON.stringify({
            groupId: dto.groupId,
            subgroupId: dto.subgroupId,
            masterCode,
          }),
        },
      });

      return { requestData, masterCode };
    });
  }

  async getHistory(id: string) {
    const request = await this.prisma.request.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    return this.prisma.workflowHistory.findMany({
      where: {
        instance: { requestId: id },
      },
      include: {
        actor: { select: { id: true, username: true, displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async savePhoto(id: string, file: { filename: string; mimetype: string; size: number }) {
    const request = await this.prisma.request.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    const photoUri = `requests/${file.filename}`;

    await this.prisma.request.update({
      where: { id },
      data: { referencePhotoUri: photoUri },
    });

    return { referencePhotoUri: photoUri };
  }

  private async generateRequestNumber(): Promise<string> {
    const last = await this.prisma.request.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { requestNumber: true },
    });

    let nextNumber = 1;
    if (last?.requestNumber) {
      const match = last.requestNumber.match(/REQ-(\d+)/);
      if (match?.[1]) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `REQ-${String(nextNumber).padStart(4, '0')}`;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async generateMasterCode(groupId: string, subgroupId: string, tx: any): Promise<string> {
    const group = await tx.catalogGroup.findUnique({ where: { id: groupId } });
    const subgroup = await tx.catalogSubgroup.findUnique({ where: { id: subgroupId } });

    const groupCode = group?.code ?? 'XX';
    const subgroupCode = subgroup?.code ?? 'XX';

    const lastItem = await tx.masterItem.findFirst({
      where: { groupId, subgroupId },
      orderBy: { masterCode: 'desc' },
      select: { masterCode: true },
    });

    let seq = 1;
    if (lastItem?.masterCode) {
      const match = lastItem.masterCode.match(/-(\d+)$/);
      if (match?.[1]) {
        seq = parseInt(match[1], 10) + 1;
      }
    }

    return `${groupCode}${subgroupCode}-${String(seq).padStart(5, '0')}`;
  }

  private getNextStatus(currentStatus: string, action: string): string {
    const transitions: Record<string, Record<string, string>> = {
      PENDING_MANAGER: { APPROVE: 'PENDING_WAREHOUSE', REJECT: 'REJECTED', RETURN: 'DRAFT' },
      PENDING_WAREHOUSE: { APPROVE: 'PENDING_ACCOUNTING', REJECT: 'REJECTED', RETURN: 'PENDING_MANAGER' },
      PENDING_ACCOUNTING: { APPROVE: 'PENDING_FINAL_REVIEW', REJECT: 'REJECTED', RETURN: 'PENDING_WAREHOUSE' },
      PENDING_FINAL_REVIEW: { APPROVE: 'APPROVED', REJECT: 'REJECTED', RETURN: 'PENDING_ACCOUNTING' },
      WAREHOUSE_APPROVED: { APPROVE: 'PENDING_ACCOUNTING', REJECT: 'REJECTED', RETURN: 'PENDING_MANAGER' },
    };

    const next = transitions[currentStatus]?.[action];
    if (!next) {
      throw new BadRequestException(`Invalid transition: ${currentStatus} -> ${action}`);
    }

    return next;
  }
}
