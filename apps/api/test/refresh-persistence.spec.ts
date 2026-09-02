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
          if (store[reqId]?.requestData) {
            store[reqId].requestData = { ...store[reqId].requestData, ...args.data };
          }
          return args.data;
        }),
      },
      auditEvent: { create: vi.fn(async () => ({})) },
      workflowInstance: { create: vi.fn(async (args: any) => ({ id: 'wf-1', ...args.data })), update: vi.fn(async () => ({})) },
      workflowTask: { create: vi.fn(async () => ({})), updateMany: vi.fn(async () => ({})) },
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
      findUnique: vi.fn(async (args: any) => {
        const row = store[args.where.id];
        if (!row) return null;
        if (args.include?.requestData && row.requestData) {
          return { ...row, requestData: row.requestData };
        }
        return row;
      }),
      findMany: vi.fn(async () => Object.values(store)),
    },
    requestData: { findUnique: vi.fn(async (args: any) => store[args.where.requestId]?.requestData ?? null) },
    $transaction: vi.fn(async (fn: any) => fn(makeTx())),
    _store: store,
  };
}

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
    const req = await solicitudesService.create({ requestedDescription: 'T', purpose: 'T' }, 'u1', 'c1', 'd1');
    await solicitudesService.submit(req.id, 'u1', 'c1');
    await solicitudesService.approve(req.id, { action: 'APPROVE' }, 'u2', 'c1');
    await solicitudesService.classify(req.id, { groupId: 'g1', subgroupId: 'sg1', partNumber: 'P-001', manufacturer: 'Siemens' }, 'u3', 'c1');

    const fresh = await almacenService.findOneForClassification(req.id);
    expect(fresh.groupId).toBe('g1');
    expect(fresh.subgroupId).toBe('sg1');
    expect(fresh.partNumber).toBe('P-001');
    expect(fresh.manufacturer).toBe('Siemens');
    expect(fresh.masterCode).toBeDefined();
  });

  it('requestData is stored in DB, not just in memory', async () => {
    const req = await solicitudesService.create({ requestedDescription: 'T', purpose: 'T' }, 'u1', 'c1', 'd1');
    await solicitudesService.submit(req.id, 'u1', 'c1');
    await solicitudesService.approve(req.id, { action: 'APPROVE' }, 'u2', 'c1');
    await solicitudesService.classify(req.id, { groupId: 'g1', subgroupId: 'sg1' }, 'u3', 'c1');

    const stored = await prisma.requestData.findUnique({ where: { requestId: req.id } });
    expect(stored).not.toBeNull();
    expect(stored.groupId).toBe('g1');
    expect(stored.subgroupId).toBe('sg1');
  });
});
