import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';

function createPrismaMock() {
  return {
    request: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    requestData: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditEvent: {
      create: vi.fn(),
    },
    workflowInstance: {
      create: vi.fn(),
      update: vi.fn(),
    },
    workflowTask: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workflowHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    approval: {
      create: vi.fn(),
    },
    catalogGroup: {
      findUnique: vi.fn(),
    },
    catalogSubgroup: {
      findUnique: vi.fn(),
    },
    masterItem: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

describe('SolicitudesService', () => {
  let service: SolicitudesService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new SolicitudesService(prisma as any);
  });

  describe('create', () => {
    it('generates a request number and creates request with DRAFT status', async () => {
      prisma.request.findFirst.mockResolvedValue(null);

      const mockRequest = {
        id: 'req-1',
        requestNumber: 'REQ-0001',
        status: 'DRAFT',
      };

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          request: { create: vi.fn().mockResolvedValue(mockRequest) },
          auditEvent: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.create(
        { requestedDescription: 'Sensor de prueba', purpose: 'Reemplazo' },
        'user-1',
        'company-1',
        'dept-1',
      );

      expect(result.requestNumber).toBe('REQ-0001');
      expect(result.status).toBe('DRAFT');
    });

    it('increments request number from the last one', async () => {
      prisma.request.findFirst.mockResolvedValue({ requestNumber: 'REQ-0042' });

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          request: {
            create: vi.fn().mockImplementation((args: any) =>
              Promise.resolve({ id: 'req-2', ...args.data }),
            ),
          },
          auditEvent: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.create(
        { requestedDescription: 'Test', purpose: 'Test' },
        'user-1',
        'company-1',
        'dept-1',
      );

      expect(result.requestNumber).toBe('REQ-0043');
    });
  });

  describe('findAll', () => {
    it('returns requests filtered by companyId', async () => {
      const mockRequests = [{ id: 'req-1', companyId: 'company-1' }];
      prisma.request.findMany.mockResolvedValue(mockRequests);

      const result = await service.findAll({ companyId: 'company-1' });

      expect(prisma.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'company-1' }),
        }),
      );
      expect(result).toEqual(mockRequests);
    });

    it('returns requests filtered by status', async () => {
      prisma.request.findMany.mockResolvedValue([]);

      await service.findAll({ status: 'DRAFT' });

      expect(prisma.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'DRAFT' }),
        }),
      );
    });

    it('applies search filter across multiple fields', async () => {
      prisma.request.findMany.mockResolvedValue([]);

      await service.findAll({ search: 'sensor' });

      expect(prisma.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { requestNumber: { contains: 'sensor' } },
              { requestedDescription: { contains: 'sensor' } },
              { purpose: { contains: 'sensor' } },
            ],
          }),
        }),
      );
    });

    it('combines multiple filters', async () => {
      prisma.request.findMany.mockResolvedValue([]);

      await service.findAll({ companyId: 'c1', status: 'DRAFT', search: 'test' });

      const call = prisma.request.findMany.mock.calls[0][0];
      expect(call.where.companyId).toBe('c1');
      expect(call.where.status).toBe('DRAFT');
      expect(call.where.OR).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('returns request when found', async () => {
      const mockRequest = { id: 'req-1', status: 'DRAFT' };
      prisma.request.findUnique.mockResolvedValue(mockRequest);

      const result = await service.findOne('req-1');

      expect(result).toEqual(mockRequest);
    });

    it('throws NotFoundException when request does not exist', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('submit', () => {
    it('changes status from DRAFT to PENDING_MANAGER', async () => {
      prisma.request.findUnique.mockResolvedValue({ id: 'req-1', status: 'DRAFT' });

      const updatedRequest = { id: 'req-1', status: 'PENDING_MANAGER' };

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          request: { update: vi.fn().mockResolvedValue(updatedRequest) },
          workflowInstance: { create: vi.fn().mockResolvedValue({ id: 'wf-1' }) },
          workflowTask: { create: vi.fn().mockResolvedValue({}) },
          workflowHistory: { create: vi.fn().mockResolvedValue({}) },
          approval: { create: vi.fn().mockResolvedValue({}) },
          auditEvent: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.submit('req-1', 'user-1', 'company-1');

      expect(result.status).toBe('PENDING_MANAGER');
    });

    it('throws NotFoundException for invalid ID', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(service.submit('nonexistent', 'user-1', 'company-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException if request is not in DRAFT status', async () => {
      prisma.request.findUnique.mockResolvedValue({ id: 'req-1', status: 'PENDING_MANAGER' });

      await expect(service.submit('req-1', 'user-1', 'company-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('approve', () => {
    it('advances workflow from PENDING_MANAGER to PENDING_WAREHOUSE on APPROVE', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING_MANAGER',
        workflowInstance: { id: 'wf-1' },
      });

      const updatedRequest = { id: 'req-1', status: 'PENDING_WAREHOUSE' };

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          request: { update: vi.fn().mockResolvedValue(updatedRequest) },
          workflowHistory: { create: vi.fn().mockResolvedValue({}) },
          workflowTask: { updateMany: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
          workflowInstance: { update: vi.fn().mockResolvedValue({}) },
          approval: { create: vi.fn().mockResolvedValue({}) },
          auditEvent: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.approve(
        'req-1',
        { action: 'APPROVE' },
        'user-1',
        'company-1',
      );

      expect(result.status).toBe('PENDING_WAREHOUSE');
    });

    it('throws BadRequestException for REJECT without comment', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING_MANAGER',
        workflowInstance: { id: 'wf-1' },
      });

      await expect(
        service.approve('req-1', { action: 'REJECT' }, 'user-1', 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for RETURN without comment', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING_MANAGER',
        workflowInstance: { id: 'wf-1' },
      });

      await expect(
        service.approve('req-1', { action: 'RETURN' }, 'user-1', 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for invalid ID', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(
        service.approve('nonexistent', { action: 'APPROVE' }, 'user-1', 'company-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when request is in DRAFT', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'DRAFT',
        workflowInstance: null,
      });

      await expect(
        service.approve('req-1', { action: 'APPROVE' }, 'user-1', 'company-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns to DRAFT on RETURN from PENDING_MANAGER', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING_MANAGER',
        workflowInstance: { id: 'wf-1' },
      });

      const updatedRequest = { id: 'req-1', status: 'DRAFT' };

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          request: { update: vi.fn().mockResolvedValue(updatedRequest) },
          workflowHistory: { create: vi.fn().mockResolvedValue({}) },
          workflowTask: {
            updateMany: vi.fn().mockResolvedValue({}),
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({}),
            update: vi.fn().mockResolvedValue({}),
          },
          workflowInstance: { update: vi.fn().mockResolvedValue({}) },
          approval: { create: vi.fn().mockResolvedValue({}) },
          auditEvent: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.approve(
        'req-1',
        { action: 'RETURN', comment: 'Needs more info' },
        'user-1',
        'company-1',
      );

      expect(result.status).toBe('DRAFT');
    });

    it('reactivates existing task on RETURN from PENDING_ACCOUNTING to PENDING_WAREHOUSE', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING_ACCOUNTING',
        workflowInstance: { id: 'wf-1' },
      });

      const updatedRequest = { id: 'req-1', status: 'PENDING_WAREHOUSE' };

      const mockHistoryCreate = vi.fn().mockResolvedValue({});
      const mockApprovalCreate = vi.fn().mockResolvedValue({});
      const mockAuditCreate = vi.fn().mockResolvedValue({});
      const mockTaskUpdateMany = vi.fn().mockResolvedValue({});
      const mockTaskFindUnique = vi.fn().mockResolvedValue({ id: 'task-warehouse', instanceId: 'wf-1', stepCode: 'PENDING_WAREHOUSE', status: 'COMPLETED' });
      const mockTaskUpdate = vi.fn().mockResolvedValue({});
      const mockInstanceUpdate = vi.fn().mockResolvedValue({});

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          request: { update: vi.fn().mockResolvedValue(updatedRequest) },
          workflowHistory: { create: mockHistoryCreate },
          workflowTask: {
            updateMany: mockTaskUpdateMany,
            findUnique: mockTaskFindUnique,
            update: mockTaskUpdate,
            create: vi.fn().mockResolvedValue({}),
          },
          workflowInstance: { update: mockInstanceUpdate },
          approval: { create: mockApprovalCreate },
          auditEvent: { create: mockAuditCreate },
        };
        return fn(tx);
      });

      const result = await service.approve(
        'req-1',
        { action: 'RETURN', comment: 'Faltan datos contables' },
        'user-4',
        'company-1',
      );

      expect(result.status).toBe('PENDING_WAREHOUSE');

      expect(mockTaskUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stepCode: 'PENDING_ACCOUNTING' }),
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );

      expect(mockTaskFindUnique).toHaveBeenCalledWith({
        where: {
          instanceId_stepCode: {
            instanceId: 'wf-1',
            stepCode: 'PENDING_WAREHOUSE',
          },
        },
      });

      expect(mockTaskUpdate).toHaveBeenCalledWith({
        where: { id: 'task-warehouse' },
        data: { status: 'PENDING', completedAt: null },
      });

      expect(mockInstanceUpdate).toHaveBeenCalledWith({
        where: { id: 'wf-1' },
        data: { currentStepCode: 'PENDING_WAREHOUSE' },
      });

      expect(mockHistoryCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromStep: 'PENDING_ACCOUNTING',
            toStep: 'PENDING_WAREHOUSE',
            action: 'RETURN',
          }),
        }),
      );

      expect(mockApprovalCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'RETURN',
            fromStatus: 'PENDING_ACCOUNTING',
            toStatus: 'PENDING_WAREHOUSE',
            comment: 'Faltan datos contables',
          }),
        }),
      );
    });

    it('creates new task on RETURN when target task does not exist', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING_ACCOUNTING',
        workflowInstance: { id: 'wf-1' },
      });

      const updatedRequest = { id: 'req-1', status: 'PENDING_WAREHOUSE' };

      const mockTaskCreate = vi.fn().mockResolvedValue({});

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          request: { update: vi.fn().mockResolvedValue(updatedRequest) },
          workflowHistory: { create: vi.fn().mockResolvedValue({}) },
          workflowTask: {
            updateMany: vi.fn().mockResolvedValue({}),
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn().mockResolvedValue({}),
            create: mockTaskCreate,
          },
          workflowInstance: { update: vi.fn().mockResolvedValue({}) },
          approval: { create: vi.fn().mockResolvedValue({}) },
          auditEvent: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      await service.approve(
        'req-1',
        { action: 'RETURN', comment: 'Retry' },
        'user-4',
        'company-1',
      );

      expect(mockTaskCreate).toHaveBeenCalledWith({
        data: {
          instanceId: 'wf-1',
          stepCode: 'PENDING_WAREHOUSE',
          status: 'PENDING',
        },
      });
    });

    it('reactivates existing task on APPROVE when target task already exists', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING_WAREHOUSE',
        workflowInstance: { id: 'wf-1' },
      });

      const updatedRequest = { id: 'req-1', status: 'PENDING_ACCOUNTING' };

      const mockTaskFindUnique = vi.fn().mockResolvedValue({ id: 'task-accounting', instanceId: 'wf-1', stepCode: 'PENDING_ACCOUNTING', status: 'COMPLETED' });
      const mockTaskUpdate = vi.fn().mockResolvedValue({});

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          request: { update: vi.fn().mockResolvedValue(updatedRequest) },
          workflowHistory: { create: vi.fn().mockResolvedValue({}) },
          workflowTask: {
            updateMany: vi.fn().mockResolvedValue({}),
            findUnique: mockTaskFindUnique,
            update: mockTaskUpdate,
            create: vi.fn().mockResolvedValue({}),
          },
          workflowInstance: { update: vi.fn().mockResolvedValue({}) },
          approval: { create: vi.fn().mockResolvedValue({}) },
          auditEvent: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.approve(
        'req-1',
        { action: 'APPROVE' },
        'user-3',
        'company-1',
      );

      expect(result.status).toBe('PENDING_ACCOUNTING');

      expect(mockTaskFindUnique).toHaveBeenCalledWith({
        where: {
          instanceId_stepCode: {
            instanceId: 'wf-1',
            stepCode: 'PENDING_ACCOUNTING',
          },
        },
      });

      expect(mockTaskUpdate).toHaveBeenCalledWith({
        where: { id: 'task-accounting' },
        data: { status: 'PENDING', completedAt: null },
      });
    });

    it('creates new task on APPROVE when no existing task', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING_MANAGER',
        workflowInstance: { id: 'wf-1' },
      });

      const updatedRequest = { id: 'req-1', status: 'PENDING_WAREHOUSE' };

      const mockTaskCreate = vi.fn().mockResolvedValue({});

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          request: { update: vi.fn().mockResolvedValue(updatedRequest) },
          workflowHistory: { create: vi.fn().mockResolvedValue({}) },
          workflowTask: {
            updateMany: vi.fn().mockResolvedValue({}),
            findUnique: vi.fn().mockResolvedValue(null),
            update: vi.fn().mockResolvedValue({}),
            create: mockTaskCreate,
          },
          workflowInstance: { update: vi.fn().mockResolvedValue({}) },
          approval: { create: vi.fn().mockResolvedValue({}) },
          auditEvent: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      await service.approve(
        'req-1',
        { action: 'APPROVE' },
        'user-2',
        'company-1',
      );

      expect(mockTaskCreate).toHaveBeenCalledWith({
        data: {
          instanceId: 'wf-1',
          stepCode: 'PENDING_WAREHOUSE',
          status: 'PENDING',
        },
      });
    });
  });

  describe('classify', () => {
    it('saves RequestData and generates master code', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING_WAREHOUSE',
      });

      prisma.requestData.findUnique.mockResolvedValue(null);

      const mockGroup = { id: 'grp-1', code: 'RVH' };
      const mockSubgroup = { id: 'sub-1', code: 'CAR' };
      const mockRequestData = { id: 'rd-1', requestId: 'req-1', masterCode: 'RVHCAR000001' };

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          requestData: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(mockRequestData),
            update: vi.fn().mockResolvedValue({ ...mockRequestData, masterCode: 'RVHCAR000001' }),
          },
          catalogGroup: { findUnique: vi.fn().mockResolvedValue(mockGroup) },
          catalogSubgroup: { findUnique: vi.fn().mockResolvedValue(mockSubgroup) },
          masterItem: { findFirst: vi.fn().mockResolvedValue(null) },
          request: { update: vi.fn().mockResolvedValue({}) },
          auditEvent: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.classify(
        'req-1',
        {
          groupId: 'grp-1',
          subgroupId: 'sub-1',
          categoryId: 'cat-1',
          brandId: 'brand-1',
          unitId: 'unit-1',
          manufacturer: 'Siemens',
          model: 'SITRANS',
          partNumber: '7MF0543',
          application: 'Temperature',
        },
        'user-1',
        'company-1',
      );

      expect(result.requestData).toBeDefined();
      expect(result.masterCode).toBeDefined();
    });

    it('throws NotFoundException for invalid ID', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(
        service.classify(
          'nonexistent',
          { groupId: 'g', subgroupId: 's' },
          'user-1',
          'company-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if request is not in classifiable status', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'DRAFT',
      });

      await expect(
        service.classify(
          'req-1',
          { groupId: 'g', subgroupId: 's' },
          'user-1',
          'company-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows classification when status is WAREHOUSE_APPROVED', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'WAREHOUSE_APPROVED',
      });

      const mockRequestData = { id: 'rd-1', requestId: 'req-1', masterCode: 'RVHCAR000001' };

      prisma.$transaction.mockImplementation(async (fn: any) => {
        const tx = {
          requestData: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue(mockRequestData),
            update: vi.fn().mockResolvedValue(mockRequestData),
          },
          catalogGroup: { findUnique: vi.fn().mockResolvedValue({ code: 'RVH' }) },
          catalogSubgroup: { findUnique: vi.fn().mockResolvedValue({ code: 'CAR' }) },
          masterItem: { findFirst: vi.fn().mockResolvedValue(null) },
          request: { update: vi.fn().mockResolvedValue({}) },
          auditEvent: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      });

      const result = await service.classify(
        'req-1',
        { groupId: 'grp-1', subgroupId: 'sub-1' },
        'user-1',
        'company-1',
      );

      expect(result.requestData).toBeDefined();
    });
  });
});
