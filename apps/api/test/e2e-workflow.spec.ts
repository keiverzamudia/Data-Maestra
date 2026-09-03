import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';
import { AlmacenService } from '../src/modulos/almacen/almacen.service';

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
        update: vi.fn(async (args: any) => {
          if (store[args.where.id]) {
            store[args.where.id] = { ...store[args.where.id], ...args.data };
          }
          return store[args.where.id];
        }),
      },
      requestData: {
        findUnique: vi.fn(async (args: any) => store[args.where.requestId]?.requestData ?? null),
        create: vi.fn(async (args: any) => {
          if (store[args.data.requestId]) {
            store[args.data.requestId].requestData = args.data;
          }
          return args.data;
        }),
        update: vi.fn(async (args: any) => args.data),
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
      findFirst: vi.fn(async () => {
        const keys = Object.keys(store);
        return keys.length > 0 ? store[keys[keys.length - 1]] : null;
      }),
      findUnique: vi.fn(async (args: any) => store[args.where.id] ?? null),
      findMany: vi.fn(async () => Object.values(store)),
    },
    requestData: {
      findUnique: vi.fn(async (args: any) => store[args.where.requestId]?.requestData ?? null),
    },
    $transaction: vi.fn(async (fn: any) => fn(makeTx())),
    _store: store,
  };
}

describe('E2E Workflow — BORRADOR to APROBADO_FINAL', () => {
  let service: SolicitudesService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new SolicitudesService(prisma as any);
  });

  it('completes full workflow', async () => {
    const request = await service.create(
      { requestedDescription: 'Sensor', purpose: 'Mant' },
      'user-1', 'c1', 'd1',
    );
    expect(request.status).toBe('BORRADOR');

    await service.submit(request.id, 'user-1', 'c1');
    await service.approve(request.id, { action: 'APPROVE' }, 'user-2', 'c1');
    await service.classify(request.id, { groupId: 'g1', subgroupId: 'sg1' }, 'user-3', 'c1');
    await service.approve(request.id, { action: 'APPROVE', comment: 'WH OK' }, 'user-3', 'c1');
    await service.approve(request.id, { action: 'APPROVE', comment: 'ACC OK' }, 'user-4', 'c1');
    const final = await service.approve(request.id, { action: 'APPROVE', comment: 'Final OK' }, 'user-5', 'c1');
    expect(final.status).toBe('APROBADO_FINAL');
  });

  it('rejects at manager stage', async () => {
    const request = await service.create({ requestedDescription: 'T', purpose: 'T' }, 'u1', 'c1', 'd1');
    await service.submit(request.id, 'u1', 'c1');
    const rejected = await service.approve(request.id, { action: 'REJECT', comment: 'No' }, 'u2', 'c1');
    expect(rejected.status).toBe('RECHAZADO');
  });

  it('returns to draft from manager', async () => {
    const request = await service.create({ requestedDescription: 'T', purpose: 'T' }, 'u1', 'c1', 'd1');
    await service.submit(request.id, 'u1', 'c1');
    const returned = await service.approve(request.id, { action: 'RETURN', comment: 'Details' }, 'u2', 'c1');
    expect(returned.status).toBe('BORRADOR');
  });
});

describe('Refresh/Persistence', () => {
  let solicitudesService: SolicitudesService;
  let almacenService: AlmacenService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    solicitudesService = new SolicitudesService(prisma as any);
    almacenService = new AlmacenService(prisma as any, solicitudesService);
  });

  it('classification data persists and is returned on GET', async () => {
    const request = await solicitudesService.create({ requestedDescription: 'T', purpose: 'T' }, 'u1', 'c1', 'd1');
    await solicitudesService.submit(request.id, 'u1', 'c1');
    await solicitudesService.approve(request.id, { action: 'APPROVE' }, 'u2', 'c1');

    await solicitudesService.classify(request.id, { groupId: 'g1', subgroupId: 'sg1', partNumber: 'P-001' }, 'u3', 'c1');

    // Simulate fresh GET from DB
    const fresh = await almacenService.findOneForClassification(request.id);
    expect(fresh.groupId).toBe('g1');
    expect(fresh.subgroupId).toBe('sg1');
    expect(fresh.partNumber).toBe('P-001');
  });
});
