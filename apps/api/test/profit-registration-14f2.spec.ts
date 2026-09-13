import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';

function makeService(overrides: {
  status?: string;
  requestData?: any;
  group?: any;
  subgroup?: any;
  engine?: any;
} = {}) {
  const db: any = {
    request: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'req-1',
        status: overrides.status ?? 'APROBADO_FINAL',
        requestedDescription: 'TORNILLO HEX',
        requestData: overrides.requestData ?? {
          groupId: 'g1', subgroupId: 's1', categoryId: null, brandId: null,
          articleType: 'C', taxType: '1', unitCode: 'UND', brandCode: '01',
          masterCode: 'ACTEQT-00001',
        },
      }),
      update: vi.fn().mockImplementation(async (a: any) => a.data),
    },
    catalogGroup: { findUnique: vi.fn().mockResolvedValue(overrides.group ?? { id: 'g1', code: 'ACT' }) },
    catalogSubgroup: { findUnique: vi.fn().mockResolvedValue(overrides.subgroup ?? { id: 's1', code: 'EQT' }) },
    catalogCategory: { findUnique: vi.fn().mockResolvedValue(null) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const engine = overrides.engine ?? {
    assertAvailable: vi.fn(),
    plan: vi.fn(),
    allocateAndInsert: vi.fn(),
    verifyAndReconcile: vi.fn(),
  };
  const service = new SolicitudesService(db, {} as any, {} as any, {} as any, {} as any, {} as any, engine);
  return { service, db, engine };
}

describe('14F.2 orquestación de registro Profit', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('createInProfit rechaza si no está APROBADO_FINAL (sin tocar el motor)', async () => {
    const { service, engine, db } = makeService({ status: 'PENDIENTE_ALMACEN' });
    await expect(service.createInProfit('req-1', 'u1', 'c1')).rejects.toThrow(BadRequestException);
    expect(engine.allocateAndInsert).not.toHaveBeenCalled();
    expect(db.request.update).not.toHaveBeenCalled();
  });

  it('createInProfit fail-fast con flag apagado, sin cambiar estado', async () => {
    const { service, engine, db } = makeService({
      engine: {
        assertAvailable: vi.fn().mockImplementation(() => { throw new Error('Profit write disabled'); }),
        allocateAndInsert: vi.fn(),
      },
    });
    await expect(service.createInProfit('req-1', 'u1', 'c1')).rejects.toThrow();
    expect(db.request.update).not.toHaveBeenCalled();
    expect(engine.allocateAndInsert).not.toHaveBeenCalled();
  });

  it('createInProfit éxito: PROCESANDO → REGISTRADO + auditoría', async () => {
    const { service, engine, db } = makeService({
      engine: {
        assertAvailable: vi.fn(),
        allocateAndInsert: vi.fn().mockResolvedValue({
          ok: true, coArt: 'ACTEQT0001', attempts: [{ attempt: 1, candidate: 'ACTEQT0001', outcome: 'INSERTED' }],
          reconcile: 'CREATED_AND_VERIFIED', differences: [],
        }),
      },
    });
    const r = await service.createInProfit('req-1', 'u1', 'c1');
    expect(r.ok).toBe(true);
    expect(r.coArt).toBe('ACTEQT0001');
    const statuses = db.request.update.mock.calls.map((c: any) => c[0].data.status);
    expect(statuses).toEqual(['PROCESANDO_PROFIT', 'REGISTRADO_PROFIT']);
    const actions = db.auditEvent.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toContain('PROFIT_CREATE_RESULT');
    const after = JSON.parse(db.auditEvent.create.mock.calls[0][0].data.afterData);
    expect(after.co_art).toBe('ACTEQT0001');
    expect(after.masterCode).toBe('ACTEQT-00001');
  });

  it('createInProfit fallo: ERROR_PROFIT sin éxito falso', async () => {
    const { service, db } = makeService({
      engine: {
        assertAvailable: vi.fn(),
        allocateAndInsert: vi.fn().mockResolvedValue({
          ok: false, coArt: 'ACTEQT0001', attempts: [], reconcile: 'NOT_FOUND', differences: [],
          errorCode: 'ERROR_PROFIT_AMBIGUOUS',
        }),
      },
    });
    const r = await service.createInProfit('req-1', 'u1', 'c1');
    expect(r.ok).toBe(false);
    const statuses = db.request.update.mock.calls.map((c: any) => c[0].data.status);
    expect(statuses).toEqual(['PROCESANDO_PROFIT', 'ERROR_PROFIT']);
  });

  it('verifyProfitCreation no cambia estados y audita PROFIT_VERIFY', async () => {
    const { service, engine, db } = makeService({
      status: 'ERROR_PROFIT',
      engine: {
        verifyAndReconcile: vi.fn().mockResolvedValue({ status: 'NOT_FOUND', differences: [] }),
      },
    });
    const r = await service.verifyProfitCreation('req-1', 'ACTEQT0001', 'u1', 'c1');
    expect(r.reconcile).toBe('NOT_FOUND');
    expect(db.request.update).not.toHaveBeenCalled();
    const actions = db.auditEvent.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toContain('PROFIT_VERIFY');
  });

  it('planProfitCreation incluye payload y disponibilidad', async () => {
    const { service } = makeService({
      engine: {
        plan: vi.fn().mockResolvedValue({
          payload: { co_art: 'ACTEQT0001' }, candidate: 'ACTEQT0001',
          available: true, nextSequence: 1, warnings: [],
        }),
      },
    });
    const r = await service.planProfitCreation('req-1', 'u1', 'c1');
    expect(r.candidate).toBe('ACTEQT0001');
    expect(r.available).toBe(true);
  });
});
