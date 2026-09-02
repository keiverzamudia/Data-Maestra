import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';

function createPrismaMock() {
  const store: Record<string, any> = {};
  let counter = 0;

  function makeTx() {
    return {
      request: {
        create: vi.fn(async (args: any) => {
          counter++;
          const id = `req-${counter}`;
          store[id] = { ...args.data, id, requestNumber: `REQ-${String(counter).padStart(4, '0')}` };
          return store[id];
        }),
        findUnique: vi.fn(async (args: any) => store[args.where.id] ?? null),
        findMany: vi.fn(async () => Object.values(store)),
        update: vi.fn(async (args: any) => {
          if (store[args.where.id]) store[args.where.id] = { ...store[args.where.id], ...args.data };
          return store[args.where.id];
        }),
      },
      requestData: {
        findUnique: vi.fn(async (args: any) => store[args.where.requestId]?.requestData ?? null),
        create: vi.fn(async (args: any) => {
          if (store[args.data.requestId]) store[args.data.requestId].requestData = args.data;
          return args.data;
        }),
        update: vi.fn(async (args: any) => {
          const reqId = args.where.requestId;
          if (store[reqId]?.requestData) store[reqId].requestData = { ...store[reqId].requestData, ...args.data };
          return args.data;
        }),
      },
      auditEvent: { create: vi.fn(async () => ({})) },
      workflowInstance: { create: vi.fn(async (args: any) => ({ id: 'wf-1', ...args.data })), update: vi.fn(async () => ({})) },
      workflowTask: { create: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) },
      workflowHistory: { create: vi.fn(async () => ({})), findMany: vi.fn(async () => []) },
      approval: { create: vi.fn(async () => ({})) },
      catalogGroup: { findUnique: vi.fn(async () => ({ id: 'g1', code: 'RVH' })) },
      catalogSubgroup: { findUnique: vi.fn(async () => ({ id: 'sg1', code: 'CAR' })) },
      masterItem: { findFirst: vi.fn(async () => null) },
    };
  }

  return {
    request: {
      findFirst: vi.fn(async () => { const k = Object.keys(store); return k.length > 0 ? store[k[k.length - 1]] : null; }),
      findUnique: vi.fn(async (args: any) => store[args.where.id] ?? null),
      findMany: vi.fn(async () => Object.values(store)),
    },
    requestData: { findUnique: vi.fn(async (args: any) => store[args.where.requestId]?.requestData ?? null) },
    $transaction: vi.fn(async (fn: any) => fn(makeTx())),
    _store: store,
  };
}

describe('Flujo Completo de Datos — Solicitante, Área, Autorizador', () => {
  let service: SolicitudesService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new SolicitudesService(prisma as any);
  });

  it('TEST A: Solicitud tiene solicitante y departamento', async () => {
    const request = await service.create(
      { requestedDescription: 'Sensor de prueba', purpose: 'Mantenimiento' },
      'u1', 'c1', 'd1',
    );

    expect(request.requesterId).toBe('u1');
    expect(request.departmentId).toBe('d1');
    expect(request.companyId).toBe('c1');
  });

  it('TEST B: Listado devuelve solicitante y área', async () => {
    await service.create(
      { requestedDescription: 'Test', purpose: 'Test' },
      'u1', 'c1', 'd1',
    );

    const results = await service.findAll({ companyId: 'c1' });

    expect(results).toHaveLength(1);
    expect(results[0].requesterId).toBe('u1');
    expect(results[0].departmentId).toBe('d1');
  });

  it('TEST C: Detalle devuelve solicitante, área y autorizador', async () => {
    const request = await service.create(
      { requestedDescription: 'Test', purpose: 'Test' },
      'u1', 'c1', 'd1',
    );

    await service.submit(request.id, 'u1', 'c1');

    const detail = await service.findOne(request.id);

    expect(detail.requesterId).toBe('u1');
    expect(detail.departmentId).toBe('d1');
    expect(detail.companyId).toBe('c1');
  });

  it('TEST D: Almacén recibe solicitante y área', async () => {
    const request = await service.create(
      { requestedDescription: 'Test', purpose: 'Test' },
      'u1', 'c1', 'd1',
    );

    await service.submit(request.id, 'u1', 'c1');
    await service.approve(request.id, { action: 'APPROVE' }, 'u2', 'c1');

    // Request is now in PENDING_WAREHOUSE
    const detail = await service.findOne(request.id);
    expect(detail.requesterId).toBe('u1');
    expect(detail.departmentId).toBe('d1');
    expect(detail.status).toBe('PENDING_WAREHOUSE');
  });

  it('TEST E: Contabilidad recibe solicitante', async () => {
    const request = await service.create(
      { requestedDescription: 'Test', purpose: 'Test' },
      'u1', 'c1', 'd1',
    );

    await service.submit(request.id, 'u1', 'c1');
    await service.approve(request.id, { action: 'APPROVE' }, 'u2', 'c1');
    // classify and approve warehouse
    await service.classify(request.id, { groupId: 'g1', subgroupId: 'sg1' }, 'u3', 'c1');
    await service.approve(request.id, { action: 'APPROVE', comment: 'WH OK' }, 'u3', 'c1');

    const detail = await service.findOne(request.id);
    expect(detail.requesterId).toBe('u1');
    expect(detail.departmentId).toBe('d1');
    expect(detail.status).toBe('PENDING_ACCOUNTING');
  });

  it('TEST H: Rechazo contable devuelve PENDING_WAREHOUSE', async () => {
    const request = await service.create(
      { requestedDescription: 'Test', purpose: 'Test' },
      'u1', 'c1', 'd1',
    );

    await service.submit(request.id, 'u1', 'c1');
    await service.approve(request.id, { action: 'APPROVE' }, 'u2', 'c1');
    await service.classify(request.id, { groupId: 'g1', subgroupId: 'sg1' }, 'u3', 'c1');
    await service.approve(request.id, { action: 'APPROVE', comment: 'WH OK' }, 'u3', 'c1');

    // Now in PENDING_ACCOUNTING
    const result = await service.approve(
      request.id,
      { action: 'RETURN', comment: 'Clasificación incorrecta' },
      'u4', 'c1',
    );

    expect(result.status).toBe('PENDING_WAREHOUSE');
  });

  it('TEST K: Solicitud vuelve a PENDING_ACCOUNTING después de corrección', async () => {
    const request = await service.create(
      { requestedDescription: 'Test', purpose: 'Test' },
      'u1', 'c1', 'd1',
    );

    await service.submit(request.id, 'u1', 'c1');
    await service.approve(request.id, { action: 'APPROVE' }, 'u2', 'c1');
    await service.classify(request.id, { groupId: 'g1', subgroupId: 'sg1' }, 'u3', 'c1');
    await service.approve(request.id, { action: 'APPROVE', comment: 'WH OK' }, 'u3', 'c1');

    // Reject from accounting → PENDING_WAREHOUSE
    await service.approve(request.id, { action: 'RETURN', comment: 'Fix classification' }, 'u4', 'c1');

    // Re-classify and approve from warehouse
    await service.classify(request.id, { groupId: 'g1', subgroupId: 'sg1' }, 'u3', 'c1');
    await service.approve(request.id, { action: 'APPROVE', comment: 'Fixed' }, 'u3', 'c1');

    const detail = await service.findOne(request.id);
    expect(detail.status).toBe('PENDING_ACCOUNTING');
    expect(detail.requesterId).toBe('u1');
    expect(detail.departmentId).toBe('d1');
  });

  it('TEST L: Aprobación Final conserva datos', async () => {
    const request = await service.create(
      { requestedDescription: 'Test', purpose: 'Test' },
      'u1', 'c1', 'd1',
    );

    await service.submit(request.id, 'u1', 'c1');
    await service.approve(request.id, { action: 'APPROVE' }, 'u2', 'c1');
    await service.classify(request.id, { groupId: 'g1', subgroupId: 'sg1' }, 'u3', 'c1');
    await service.approve(request.id, { action: 'APPROVE', comment: 'WH OK' }, 'u3', 'c1');
    await service.approve(request.id, { action: 'APPROVE', comment: 'ACC OK' }, 'u4', 'c1');

    // Now in PENDING_FINAL_REVIEW
    const detail = await service.findOne(request.id);

    expect(detail.requesterId).toBe('u1');
    expect(detail.departmentId).toBe('d1');
    expect(detail.status).toBe('PENDING_FINAL_REVIEW');
    expect(detail.groupId).toBe('g1');
    expect(detail.masterCode).toBeDefined();
  });
});
