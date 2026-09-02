import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ContabilidadService } from '../src/modulos/contabilidad/contabilidad.service';

function createPrismaMock() {
  return {
    request: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    requestAccountingCode: {
      createMany: vi.fn(),
    },
  };
}

function createSolicitudesServiceMock() {
  return {
    approve: vi.fn(),
  };
}

describe('ContabilidadService', () => {
  let service: ContabilidadService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let SolicitudesService: ReturnType<typeof createSolicitudesServiceMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    SolicitudesService = createSolicitudesServiceMock();
    service = new ContabilidadService(prisma as any, SolicitudesService as any);
  });

  describe('findPendingApproval', () => {
    it('returns requests with PENDING_ACCOUNTING status', async () => {
      prisma.request.findMany.mockResolvedValue([
        { id: 'req-1', status: 'PENDING_ACCOUNTING', requestData: { groupId: 'g1' }, accountingCodes: [] },
      ]);

      const result = await service.findPendingApproval();

      expect(result).toHaveLength(1);
      expect(result[0].groupId).toBe('g1');
    });
  });

  describe('findOneForReview', () => {
    it('returns request with flattened data', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING_ACCOUNTING',
        requestData: { groupId: 'g1', subgroupId: 'sg1', masterCode: 'RVHCAR-00001' },
        accountingCodes: [],
      });

      const result = await service.findOneForReview('req-1');

      expect(result.groupId).toBe('g1');
      expect(result.subgroupId).toBe('sg1');
      expect(result.masterCode).toBe('RVHCAR-00001');
    });

    it('throws NotFoundException when not found', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(service.findOneForReview('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('approve', () => {
    it('saves accounting codes and advances workflow', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING_ACCOUNTING',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });
      prisma.requestAccountingCode.createMany.mockResolvedValue({ count: 1 });
      SolicitudesService.approve.mockResolvedValue({ id: 'req-1', status: 'PENDING_FINAL_REVIEW' });

      const result = await service.approve(
        'req-1',
        [{ code: '5010-01', description: 'Repuestos' }],
        'user-1',
        'c1',
      );

      expect(prisma.requestAccountingCode.createMany).toHaveBeenCalledWith({
        data: [{ requestId: 'req-1', code: '5010-01', description: 'Repuestos' }],
      });
      expect(SolicitudesService.approve).toHaveBeenCalledWith(
        'req-1',
        { action: 'APPROVE', comment: 'Accounting approved' },
        'user-1',
        'c1',
      );
      expect(result.status).toBe('PENDING_FINAL_REVIEW');
    });

    it('allows approve with empty accounting codes', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING_ACCOUNTING',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });
      SolicitudesService.approve.mockResolvedValue({ id: 'req-1', status: 'PENDING_FINAL_REVIEW' });

      const result = await service.approve('req-1', [], 'user-1', 'c1');

      expect(prisma.requestAccountingCode.createMany).not.toHaveBeenCalled();
      expect(result.status).toBe('PENDING_FINAL_REVIEW');
    });

    it('throws NotFoundException when request is not PENDING_ACCOUNTING', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'APPROVED',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });

      await expect(
        service.approve('req-1', [{ code: '5010-01', description: 'Test' }], 'user-1', 'c1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('reject', () => {
    it('rejects with comment and returns to warehouse', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING_ACCOUNTING',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });
      SolicitudesService.approve.mockResolvedValue({ id: 'req-1', status: 'PENDING_WAREHOUSE' });

      await service.reject('req-1', 'Codes incorrect', 'user-1', 'c1');

      expect(SolicitudesService.approve).toHaveBeenCalledWith(
        'req-1',
        { action: 'RETURN', comment: 'Codes incorrect' },
        'user-1',
        'c1',
      );
    });

    it('throws when no comment is provided', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDING_ACCOUNTING',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });

      await expect(service.reject('req-1', undefined, 'user-1', 'c1')).rejects.toThrow('El motivo del rechazo es obligatorio');
    });

    it('throws NotFoundException when request is not PENDING_ACCOUNTING', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'APPROVED',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });

      await expect(service.reject('req-1', 'reason', 'user-1', 'c1')).rejects.toThrow(NotFoundException);
    });
  });
});
