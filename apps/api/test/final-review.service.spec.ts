import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { RevisionFinalService } from '../src/modulos/revision-final/revision-final.service';

function createPrismaMock() {
  return {
    request: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  };
}

function createSolicitudesServiceMock() {
  return {
    approve: vi.fn(),
  };
}

describe('RevisionFinalService', () => {
  let service: RevisionFinalService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let SolicitudesService: ReturnType<typeof createSolicitudesServiceMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    SolicitudesService = createSolicitudesServiceMock();
    service = new RevisionFinalService(prisma as any, SolicitudesService as any);
  });

  describe('findPendingReview', () => {
    it('returns requests with PENDIENTE_VALIDACION_MAESTRA status', async () => {
      prisma.request.findMany.mockResolvedValue([
        { id: 'req-1', status: 'PENDIENTE_VALIDACION_MAESTRA', requestData: { groupId: 'g1' }, accountingCodes: [] },
      ]);

      const result = await service.findPendingReview();

      expect(result).toHaveLength(1);
      expect(result[0].groupId).toBe('g1');
    });
  });

  describe('findOneForReview', () => {
    it('returns request with approvals', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_VALIDACION_MAESTRA',
        requestData: { groupId: 'g1', masterCode: 'RVHCAR-00001' },
        accountingCodes: [{ code: '5010-01', description: 'Repuestos' }],
        approvals: [],
      });

      const result = await service.findOneForReview('req-1');

      expect(result.groupId).toBe('g1');
      expect(result.masterCode).toBe('RVHCAR-00001');
    });

    it('throws NotFoundException when not found', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(service.findOneForReview('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('approve', () => {
    it('approves and transitions to APROBADO_FINAL', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_VALIDACION_MAESTRA',
      });
      SolicitudesService.approve.mockResolvedValue({ id: 'req-1', status: 'APROBADO_FINAL' });

      const result = await service.approve('req-1', 'user-1', 'c1');

      expect(SolicitudesService.approve).toHaveBeenCalledWith(
        'req-1',
        { action: 'APPROVE', comment: 'Final review approved' },
        'user-1',
        'c1',
      );
      expect(result.status).toBe('APROBADO_FINAL');
    });

    it('throws NotFoundException when request not found', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(service.approve('nonexistent', 'user-1', 'c1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when status is not PENDIENTE_VALIDACION_MAESTRA', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'APROBADO_FINAL',
      });

      await expect(service.approve('req-1', 'user-1', 'c1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reject', () => {
    it('rejects with comment', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_VALIDACION_MAESTRA',
      });
      SolicitudesService.approve.mockResolvedValue({ id: 'req-1', status: 'RECHAZADO' });

      await service.reject('req-1', 'Incomplete documentation', 'user-1', 'c1');

      expect(SolicitudesService.approve).toHaveBeenCalledWith(
        'req-1',
        { action: 'REJECT', comment: 'Incomplete documentation' },
        'user-1',
        'c1',
      );
    });

    it('uses default comment when none provided', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_VALIDACION_MAESTRA',
      });
      SolicitudesService.approve.mockResolvedValue({ id: 'req-1', status: 'RECHAZADO' });

      await service.reject('req-1', undefined, 'user-1', 'c1');

      expect(SolicitudesService.approve).toHaveBeenCalledWith(
        'req-1',
        { action: 'REJECT', comment: 'Rejected at final review' },
        'user-1',
        'c1',
      );
    });

    it('throws NotFoundException when request not found', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(service.reject('nonexistent', 'reason', 'user-1', 'c1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when status is not PENDIENTE_VALIDACION_MAESTRA', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'BORRADOR',
      });

      await expect(service.reject('req-1', 'reason', 'user-1', 'c1')).rejects.toThrow(NotFoundException);
    });
  });
});
