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
    catalogGroup: {
      findUnique: vi.fn(async () => ({ id: 'g1', code: 'FER', sourceCode: 'FER' })),
    },
  };
}

function createSolicitudesServiceMock() {
  return {
    approve: vi.fn(),
  };
}

function createProfitMock(configured = true) {
  return {
    getGroupAccountingStandard: vi.fn(async (code: string) => ({
      groupCode: code,
      configured,
      positions: configured
        ? [{ position: 'c1', code: '1.1.04.03.01.006', description: 'Inventario', inCatalog: true }]
        : [],
    })),
  };
}

describe('ContabilidadService', () => {
  let service: ContabilidadService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let SolicitudesService: ReturnType<typeof createSolicitudesServiceMock>;
  let profit: ReturnType<typeof createProfitMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    SolicitudesService = createSolicitudesServiceMock();
    profit = createProfitMock();
    service = new ContabilidadService(prisma as any, SolicitudesService as any, profit as any);
  });

  describe('findPendingApproval', () => {
    it('returns requests with PENDIENTE_CONTABILIDAD status', async () => {
      prisma.request.findMany.mockResolvedValue([
        { id: 'req-1', status: 'PENDIENTE_CONTABILIDAD', requestData: { groupId: 'g1' }, accountingCodes: [] },
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
        status: 'PENDIENTE_CONTABILIDAD',
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
        status: 'PENDIENTE_CONTABILIDAD',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });
      prisma.requestAccountingCode.createMany.mockResolvedValue({ count: 1 });
      SolicitudesService.approve.mockResolvedValue({ id: 'req-1', status: 'PENDIENTE_VALIDACION_MAESTRA' });

      const result = await service.approve(
        'req-1',
        [{ code: '5010-01', description: 'Repuestos' }],
        'user-1',
        'c1',
      );

      expect(prisma.requestAccountingCode.createMany).toHaveBeenCalledWith({
        data: [{ requestId: 'req-1', code: '5010-01', description: 'Repuestos', position: null }],
      });
      expect(SolicitudesService.approve).toHaveBeenCalledWith(
        'req-1',
        { action: 'APPROVE', comment: 'Accounting approved' },
        'user-1',
        'c1',
      );
      expect(result.status).toBe('PENDIENTE_VALIDACION_MAESTRA');
    });

    it('12C — rechaza aprobar sin posiciones (mínimo 1)', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_CONTABILIDAD',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });

      await expect(service.approve('req-1', [], 'user-1', 'c1')).rejects.toThrow(/mínimo 1/);
      expect(prisma.requestAccountingCode.createMany).not.toHaveBeenCalled();
    });

    it('12C — bloquea aprobar si el grupo no tiene estándar en Profit', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_CONTABILIDAD',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });
      service = new ContabilidadService(prisma as any, SolicitudesService as any, createProfitMock(false) as any);

      await expect(
        service.approve('req-1', [{ code: '1.1.04.03.01.006', description: 'Inventario' }], 'user-1', 'c1'),
      ).rejects.toThrow(/no tiene información contable configurada en Profit/);
      expect(SolicitudesService.approve).not.toHaveBeenCalled();
    });

    it('12C — Profit inaccesible bloquea con 503 explícito', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_CONTABILIDAD',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });
      const failing = { getGroupAccountingStandard: vi.fn(async () => { throw new Error('timeout'); }) };
      service = new ContabilidadService(prisma as any, SolicitudesService as any, failing as any);

      await expect(
        service.approve('req-1', [{ code: '1.1.04.03.01.006', description: 'Inventario' }], 'user-1', 'c1'),
      ).rejects.toThrow(/No se pudo consultar Profit/);
    });

    it('throws NotFoundException when request is not PENDIENTE_CONTABILIDAD', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'APROBADO_FINAL',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });

      await expect(
        service.approve('req-1', [{ code: '5010-01', description: 'Test' }], 'user-1', 'c1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('12G — observaciones viajan como comentario del approval', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_CONTABILIDAD',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });
      prisma.requestAccountingCode.createMany.mockResolvedValue({ count: 1 });
      SolicitudesService.approve.mockResolvedValue({ id: 'req-1', status: 'PENDIENTE_VALIDACION_MAESTRA' });

      await service.approve(
        'req-1',
        [{ code: '5010-01', description: 'Repuestos' }],
        'user-1',
        'c1',
        'Revisado contra estándar FER',
      );

      expect(SolicitudesService.approve).toHaveBeenCalledWith(
        'req-1',
        { action: 'APPROVE', comment: 'Revisado contra estándar FER' },
        'user-1',
        'c1',
      );
    });

    it('persists c1..c10 positions (Fase 8E)', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_CONTABILIDAD',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });
      prisma.requestAccountingCode.createMany.mockResolvedValue({ count: 2 });
      SolicitudesService.approve.mockResolvedValue({ id: 'req-1', status: 'PENDIENTE_VALIDACION_MAESTRA' });

      await service.approve(
        'req-1',
        [
          { code: '1.2.05.02.06.001', description: 'Costo mobiliario', position: 'c1' },
          { code: '1.1.04.01.01.001', description: 'Mercancías en tránsito', position: 'c7' },
        ],
        'user-1',
        'c1',
      );

      expect(prisma.requestAccountingCode.createMany).toHaveBeenCalledWith({
        data: [
          { requestId: 'req-1', code: '1.2.05.02.06.001', description: 'Costo mobiliario', position: 'c1' },
          { requestId: 'req-1', code: '1.1.04.01.01.001', description: 'Mercancías en tránsito', position: 'c7' },
        ],
      });
    });

    it('rejects duplicate position', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_CONTABILIDAD',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });

      await expect(
        service.approve(
          'req-1',
          [
            { code: 'a', description: 'A', position: 'c1' },
            { code: 'b', description: 'B', position: 'c1' },
          ],
          'user-1',
          'c1',
        ),
      ).rejects.toThrow(/duplicada/);
    });

    it('rejects invalid position c11', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_CONTABILIDAD',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });

      await expect(
        service.approve('req-1', [{ code: 'a', description: 'A', position: 'c11' }], 'user-1', 'c1'),
      ).rejects.toThrow(/c1\.\.c10/);
    });
  });

  describe('reject', () => {
    it('rejects with comment and returns to warehouse', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'PENDIENTE_CONTABILIDAD',
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
        status: 'PENDIENTE_CONTABILIDAD',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });

      await expect(service.reject('req-1', undefined, 'user-1', 'c1')).rejects.toThrow('El motivo del rechazo es obligatorio');
    });

    it('throws NotFoundException when request is not PENDIENTE_CONTABILIDAD', async () => {
      prisma.request.findUnique.mockResolvedValue({
        id: 'req-1',
        status: 'APROBADO_FINAL',
        requestData: { groupId: 'g1' },
        accountingCodes: [],
      });

      await expect(service.reject('req-1', 'reason', 'user-1', 'c1')).rejects.toThrow(NotFoundException);
    });
  });
});
