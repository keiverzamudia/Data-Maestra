import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AlmacenService } from '../src/modulos/almacen/almacen.service';

function createPrismaMock() {
  return {
    request: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    requestData: {
      findUnique: vi.fn(),
    },
  };
}

function createSolicitudesServiceMock() {
  return {
    classify: vi.fn(),
    approve: vi.fn(),
  };
}

describe('AlmacenService', () => {
  let service: AlmacenService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let SolicitudesService: ReturnType<typeof createSolicitudesServiceMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    SolicitudesService = createSolicitudesServiceMock();
    service = new AlmacenService(prisma as any, SolicitudesService as any);
  });

  describe('findPendingClassification', () => {
    it('returns requests with PENDIENTE_ALMACEN status', async () => {
      prisma.request.findMany.mockResolvedValue([
        { id: 'req-1', status: 'PENDIENTE_ALMACEN', requestData: null },
      ]);

      const result = await service.findPendingClassification();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('req-1');
    });
  });

  describe('findOneForClassification', () => {
    it('returns request when found', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_ALMACEN',
        requestData: { groupId: 'g1', subgroupId: 'sg1' },
      });

      const result = await service.findOneForClassification('req-1');

      expect(result.id).toBe('req-1');
      expect(result.groupId).toBe('g1');
    });

    it('throws NotFoundException when not found', async () => {
      prisma.request.findUnique.mockResolvedValue(null);

      await expect(service.findOneForClassification('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('approve', () => {
    it('throws BadRequestException when no requestData exists', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_ALMACEN',
        requestData: null,
      });
      prisma.requestData.findUnique.mockResolvedValue(null);

      await expect(service.approve('req-1', 'user-1', 'c1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when groupId is missing', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_ALMACEN',
        requestData: { requestId: 'req-1' },
      });
      prisma.requestData.findUnique.mockResolvedValue({
        requestId: 'req-1',
        groupId: null,
        subgroupId: 'sg1',
        masterCode: 'RVHCAR-00001',
      });

      await expect(service.approve('req-1', 'user-1', 'c1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when subgroupId is missing', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_ALMACEN',
        requestData: { requestId: 'req-1' },
      });
      prisma.requestData.findUnique.mockResolvedValue({
        requestId: 'req-1',
        groupId: 'g1',
        subgroupId: null,
        masterCode: 'RVHCAR-00001',
      });

      await expect(service.approve('req-1', 'user-1', 'c1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when masterCode is missing', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_ALMACEN',
        requestData: { requestId: 'req-1' },
      });
      prisma.requestData.findUnique.mockResolvedValue({
        requestId: 'req-1',
        groupId: 'g1',
        subgroupId: 'sg1',
        masterCode: null,
      });

      await expect(service.approve('req-1', 'user-1', 'c1')).rejects.toThrow(BadRequestException);
    });

    it('calls SolicitudesService.approve when classification is complete', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_ALMACEN',
        requestData: { requestId: 'req-1' },
      });
      prisma.requestData.findUnique.mockResolvedValue({
        requestId: 'req-1',
        groupId: 'g1',
        subgroupId: 'sg1',
        masterCode: 'RVHCAR-00001',
      });
      SolicitudesService.approve.mockResolvedValue({ id: 'req-1', status: 'PENDIENTE_CONTABILIDAD' });

      const result = await service.approve('req-1', 'user-1', 'c1');

      expect(SolicitudesService.approve).toHaveBeenCalledWith(
        'req-1',
        { action: 'APPROVE', comment: 'Warehouse classification approved' },
        'user-1',
        'c1',
      );
      expect(result.status).toBe('PENDIENTE_CONTABILIDAD');
    });

    it('throws NotFoundException when request is not in classifiable status', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'BORRADOR',
        requestData: null,
      });

      await expect(service.approve('req-1', 'user-1', 'c1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('returnToRequester', () => {
    it('calls SolicitudesService.approve with RETURN action', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_ALMACEN',
        requestData: null,
      });
      SolicitudesService.approve.mockResolvedValue({ id: 'req-1', status: 'BORRADOR' });

      await service.returnToRequester('req-1', 'Missing info', 'user-1', 'c1');

      expect(SolicitudesService.approve).toHaveBeenCalledWith(
        'req-1',
        { action: 'RETURN', comment: 'Missing info' },
        'user-1',
        'c1',
      );
    });

    it('uses default comment when none provided', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_ALMACEN',
        requestData: null,
      });
      SolicitudesService.approve.mockResolvedValue({ id: 'req-1', status: 'BORRADOR' });

      await service.returnToRequester('req-1', undefined, 'user-1', 'c1');

      expect(SolicitudesService.approve).toHaveBeenCalledWith(
        'req-1',
        { action: 'RETURN', comment: 'Returned to requester' },
        'user-1',
        'c1',
      );
    });
  });
});
