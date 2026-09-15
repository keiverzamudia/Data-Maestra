import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
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
        requestNumber: 'REQ-0055',
        status: overrides.status ?? 'CONTABILIDAD_APROBADA',
        requestedDescription: 'TORNILLO HEX',
        requestData: overrides.requestData ?? {
          groupId: 'g1', subgroupId: 's1', categoryId: null, brandId: null,
          articleType: 'C', taxType: '1', unitCode: 'UND', brandCode: '01',
          masterCode: 'ACTEQT-00001',
        },
      }),
      update: vi.fn().mockImplementation(async (a: any) => a.data),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    catalogGroup: { findUnique: vi.fn().mockResolvedValue(overrides.group ?? { id: 'g1', code: 'ACT' }) },
    catalogSubgroup: { findUnique: vi.fn().mockResolvedValue(overrides.subgroup ?? { id: 's1', code: 'EQT' }) },
    catalogCategory: { findUnique: vi.fn().mockResolvedValue(null) },
    requestData: { update: vi.fn().mockResolvedValue({}) },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const engine = overrides.engine ?? {
    assertAvailable: vi.fn(),
    plan: vi.fn(),
    allocateAndInsert: vi.fn(),
    verifyAndReconcile: vi.fn(),
  };
  const service = new SolicitudesService(db, {} as any, {} as any, {} as any, {} as any, engine);
  return { service, db, engine };
}

describe('14F.2 orquestación de registro Profit', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('createInProfit rechaza si no está CONTABILIDAD_APROBADA (sin tocar el motor)', async () => {
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

  it('createInProfit éxito: PROCESANDO → INSERTADO + auditoría §24', async () => {
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
    expect(r.correlationId).toMatch(/^DM-PROFIT-\d{8}-000055$/);
    const statuses = [
      ...db.request.updateMany.mock.calls.map((c: any) => c[0].data.status),
      ...db.request.update.mock.calls.map((c: any) => c[0].data.status),
    ];
    expect(statuses).toEqual(['PROCESANDO_PROFIT', 'INSERTADO_PROFIT']);
    const actions = db.auditEvent.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toEqual(['PROFIT_WRITE_STARTED', 'PROFIT_WRITE_SUCCEEDED']);
    const after = JSON.parse(db.auditEvent.create.mock.calls[1][0].data.afterData);
    expect(after.co_art).toBe('ACTEQT0001');
    expect(after.masterCode).toBe('ACTEQT-00001');
    expect(after.correlationId).toBe(r.correlationId);
    // 5. actor humano intacto (usuario de sesión, no técnico ni Profit).
    for (const call of db.auditEvent.create.mock.calls) {
      expect(call[0].data.actorId).toBe('u1');
    }
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
    const statuses = [
      ...db.request.updateMany.mock.calls.map((c: any) => c[0].data.status),
      ...db.request.update.mock.calls.map((c: any) => c[0].data.status),
    ];
    expect(statuses).toEqual(['PROCESANDO_PROFIT', 'ERROR_PROFIT']);
  });

  it('colisión registra CODE_COLLISION_RESOLVED con la cadena', async () => {
    const { service, db } = makeService({
      engine: {
        assertAvailable: vi.fn(),
        allocateAndInsert: vi.fn().mockResolvedValue({
          ok: true, coArt: 'ACTEQT0002',
          attempts: [
            { attempt: 1, candidate: 'ACTEQT0001', outcome: 'COLLISION' },
            { attempt: 2, candidate: 'ACTEQT0002', outcome: 'INSERTED' },
          ],
          reconcile: 'CREATED_AND_VERIFIED', differences: [],
        }),
      },
    });
    const r = await service.createInProfit('req-1', 'u1', 'c1');
    expect(r.coArt).toBe('ACTEQT0002');
    const actions = db.auditEvent.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toContain('CODE_COLLISION_RESOLVED');
    const col = JSON.parse(db.auditEvent.create.mock.calls.find((c: any) => c[0].data.action === 'CODE_COLLISION_RESOLVED')[0].data.afterData);
    expect(col.chain).toEqual(['ACTEQT0001']);
    expect(col.final).toBe('ACTEQT0002');
  });

  it('ambiguo audita PROFIT_WRITE_RESULT_UNKNOWN', async () => {
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
    const actions = db.auditEvent.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toContain('PROFIT_WRITE_RESULT_UNKNOWN');
  });

  it('INSERTADO_PROFIT no re-inserta (§25 idempotencia)', async () => {
    const { service, engine, db } = makeService({ status: 'INSERTADO_PROFIT' });
    await expect(service.createInProfit('req-1', 'u1', 'c1')).rejects.toThrow(BadRequestException);
    expect(engine.allocateAndInsert).not.toHaveBeenCalled();
    expect(db.request.update).not.toHaveBeenCalled();
  });

  it('profitCode NO se persiste si falla (solo tras VERIFY)', async () => {
    const { service, db } = makeService({
      engine: {
        assertAvailable: vi.fn(),
        allocateAndInsert: vi.fn().mockResolvedValue({
          ok: false, coArt: 'ACTEQT0001', attempts: [], reconcile: 'NOT_FOUND', differences: [],
          errorCode: 'ERROR_PROFIT_AMBIGUOUS',
        }),
      },
    });
    await service.createInProfit('req-1', 'u1', 'c1');
    const rdUpdates = (db.requestData?.update?.mock?.calls ?? []).length;
    expect(rdUpdates).toBe(0);
  });

  it('segunda ejecución tras éxito es 400 sin tocar el motor', async () => {
    const { service, engine } = makeService({
      status: 'INSERTADO_PROFIT',
      engine: { assertAvailable: vi.fn(), allocateAndInsert: vi.fn() },
    });
    await expect(service.createInProfit('req-1', 'u1', 'c1')).rejects.toThrow(BadRequestException);
    expect(engine.allocateAndInsert).not.toHaveBeenCalled();
  });

  it('ALREADY_REGISTERED marca INSERTADO con auditoría de éxito', async () => {
    const { service, db } = makeService({
      engine: {
        assertAvailable: vi.fn(),
        allocateAndInsert: vi.fn().mockResolvedValue({
          ok: true, coArt: 'ACTEQT0001', attempts: [{ attempt: 1, candidate: 'ACTEQT0001', existedBefore: true, outcome: 'ALREADY_REGISTERED' }],
          reconcile: 'CREATED_AND_VERIFIED', differences: [], alreadyRegistered: true,
        }),
      },
    });
    const r = await service.createInProfit('req-1', 'u1', 'c1');
    expect(r.ok).toBe(true);
    expect(r.alreadyRegistered).toBe(true);
    const statuses = [
      ...db.request.updateMany.mock.calls.map((c: any) => c[0].data.status),
      ...db.request.update.mock.calls.map((c: any) => c[0].data.status),
    ];
    expect(statuses).toEqual(['PROCESANDO_PROFIT', 'INSERTADO_PROFIT']);
    const actions = db.auditEvent.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toContain('PROFIT_WRITE_SUCCEEDED');
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

describe('14K.5 concurrencia, retry e historial', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('concurrentes: solo una ejecuta, la otra es rechazada (backend manda)', async () => {
    const { service, engine, db } = makeService({
      engine: { assertAvailable: vi.fn(), allocateAndInsert: vi.fn().mockResolvedValue({ ok: true, coArt: 'X', attempts: [], reconcile: 'CREATED_AND_VERIFIED', differences: [] }) },
    });
    db.request.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const a = service.createInProfit('req-1', 'u1', 'c1');
    const b = service.createInProfit('req-1', 'u2', 'c1');
    const [ra, rb] = await Promise.allSettled([a, b]);
    const fulfilled = [ra, rb].filter((r) => r.status === 'fulfilled');
    const rejected = [ra, rb].filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect(engine.allocateAndInsert).toHaveBeenCalledTimes(1);
  });

  it('transición atómica perdida rechaza sin tocar el motor', async () => {
    const { service, engine, db } = makeService({
      engine: { assertAvailable: vi.fn(), allocateAndInsert: vi.fn() },
    });
    db.request.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.createInProfit('req-1', 'u1', 'c1')).rejects.toThrow(ConflictException);
    expect(engine.allocateAndInsert).not.toHaveBeenCalled();
  });

  it('doble llamada con lock activo rechaza la segunda (backend manda)', async () => {
    let release!: () => void;
    const gate = new Promise<void>((res) => { release = res; });
    const { service, engine } = makeService({
      engine: {
        assertAvailable: vi.fn(),
        allocateAndInsert: vi.fn().mockImplementation(async () => {
          await gate;
          return { ok: true, coArt: 'X', attempts: [], reconcile: 'CREATED_AND_VERIFIED', differences: [] };
        }),
      },
    });
    const first = service.createInProfit('req-1', 'u1', 'c1');
    await new Promise((r) => setTimeout(r, 10));
    await expect(service.createInProfit('req-1', 'u1', 'c1')).rejects.toThrow(ConflictException);
    release();
    const r = await first;
    expect(r.ok).toBe(true);
    expect(engine.allocateAndInsert).toHaveBeenCalledTimes(1);
  });

  it('retry READY re-encola a CONTABILIDAD_APROBADA con nueva correlación', async () => {
    const { service, db } = makeService({
      status: 'ERROR_PROFIT',
      engine: {
        plan: vi.fn().mockResolvedValue({ payload: {}, candidate: 'ACTEQT0002', available: true, nextSequence: 2, warnings: [] }),
      },
    });
    const r = await service.requestProfitRetry('req-1', 'u1', 'c1');
    expect(r.ready).toBe(true);
    expect(r.candidate).toBe('ACTEQT0002');
    expect(r.correlationId).toMatch(/^DM-PROFIT-\d{8}-000055$/);
    expect(db.request.update).toHaveBeenCalledWith({ where: { id: 'req-1' }, data: { status: 'CONTABILIDAD_APROBADA' } });
    const actions = db.auditEvent.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toContain('PROFIT_RETRY_REQUESTED');
  });

  it('retry BLOCKED fuera de ERROR_PROFIT y sin escribir', async () => {
    const { service, db } = makeService({ status: 'CONTABILIDAD_APROBADA' });
    await expect(service.requestProfitRetry('req-1', 'u1', 'c1')).rejects.toThrow(BadRequestException);
    expect(db.request.update).not.toHaveBeenCalled();
  });

  it('historial agrupa intentos por correlationId sin reescribir', async () => {
    const prisma: any = {
      request: { findUnique: vi.fn().mockResolvedValue({ id: 'req-1' }) },
      auditEvent: {
        findMany: vi.fn().mockResolvedValue([
          { action: 'PROFIT_WRITE_STARTED', correlationId: 'C1', createdAt: 't1', actorId: 'u1', afterData: JSON.stringify({ masterCode: 'M', co_art: 'A1' }) },
          { action: 'PROFIT_WRITE_FAILED', correlationId: 'C1', createdAt: 't2', actorId: 'u1', afterData: JSON.stringify({ co_art: 'A1', reconcile: 'RECONCILIATION_ERROR', errorCode: 'E1', durationMs: 5 }) },
          { action: 'PROFIT_WRITE_STARTED', correlationId: 'C2', createdAt: 't3', actorId: 'u1', afterData: JSON.stringify({ masterCode: 'M' }) },
          { action: 'CODE_COLLISION_RESOLVED', correlationId: 'C2', createdAt: 't4', actorId: 'u1', afterData: JSON.stringify({ chain: ['A1'], final: 'A2' }) },
          { action: 'PROFIT_WRITE_SUCCEEDED', correlationId: 'C2', createdAt: 't5', actorId: 'u1', afterData: JSON.stringify({ co_art: 'A2', reconcile: 'CREATED_AND_VERIFIED', durationMs: 7 }) },
          { action: 'PROFIT_VERIFY', correlationId: 'C2', createdAt: 't6', actorId: 'u1', afterData: JSON.stringify({ co_art: 'A2' }) },
        ]),
      },
    };
    const service = new SolicitudesService(prisma, {} as any, {} as any, {} as any, {} as any);
    const h = await service.profitAttempts('req-1');
    expect(h.attempts).toHaveLength(2);
    expect(h.attempts[0]).toMatchObject({ attempt: 1, correlationId: 'C1', coArt: 'A1', result: 'FAILED', errorCode: 'E1' });
    expect(h.attempts[1]).toMatchObject({ attempt: 2, correlationId: 'C2', coArt: 'A2', result: 'SUCCESS', collisions: ['A1'] });
    expect(h.verifications).toHaveLength(1);
  });
});
