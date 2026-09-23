import { describe, it, expect, vi } from 'vitest';
import { RequestCountersService } from '../src/modulos/solicitudes/request-counters.service';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';

process.env.JWT_SECRET = 'test-secret-counters';

interface R {
  id: string;
  requestNumber: string;
  requesterId: string;
  companyId: string;
  departmentId: string;
  status: string;
  createdAt: Date;
  approvals?: { actorId: string; action: string; createdAt: Date }[];
}

const D = (s: string) => new Date(s);

/**
 * Universo:
 *  c1 Empresa A, c2 Empresa B
 *  r1 PENDIENTE_GERENTE  dept Compras c1  (gerente carlos dirige Compras)
 *  r2 PENDIENTE_ALMACEN  c1
 *  r3 PENDIENTE_ALMACEN  c2  (fuera del alcance de w1 solo-c1)
 *  r4 ALMACEN_APROBADO   c1
 *  r5 PENDIENTE_CONTABILIDAD c1
 *  r6 CONTABILIDAD_APROBADA  c1  (registro Profit pendiente)
 *  r7 INSERTADO_PROFIT       c1  (completada de juan)
 *  r8 RECHAZADO              c1  (rechazada de juan)
 *  r9 PENDIENTE_GERENTE  dept Ventas c1 (NO dirigido por carlos)
 *  r10 DEVUELTO           c1
 */
function seed(): { requests: R[] } {
  return {
    requests: [
      { id: 'r1', requestNumber: 'REQ-0001', requesterId: 'juan', companyId: 'c1', departmentId: 'dCompras', status: 'PENDIENTE_GERENTE', createdAt: D('2026-09-01') },
      { id: 'r2', requestNumber: 'REQ-0002', requesterId: 'ana', companyId: 'c1', departmentId: 'dAlmacen', status: 'PENDIENTE_ALMACEN', createdAt: D('2026-09-02') },
      { id: 'r3', requestNumber: 'REQ-0003', requesterId: 'luis', companyId: 'c2', departmentId: 'dAlmB', status: 'PENDIENTE_ALMACEN', createdAt: D('2026-09-03') },
      { id: 'r4', requestNumber: 'REQ-0004', requesterId: 'ana', companyId: 'c1', departmentId: 'dAlmacen', status: 'ALMACEN_APROBADO', createdAt: D('2026-09-04') },
      { id: 'r5', requestNumber: 'REQ-0005', requesterId: 'juan', companyId: 'c1', departmentId: 'dCompras', status: 'PENDIENTE_CONTABILIDAD', createdAt: D('2026-09-05'),
        approvals: [{ actorId: 'm1', action: 'APPROVE', createdAt: D('2026-09-06') }] },
      { id: 'r6', requestNumber: 'REQ-0006', requesterId: 'ana', companyId: 'c1', departmentId: 'dAlmacen', status: 'CONTABILIDAD_APROBADA', createdAt: D('2026-09-06') },
      { id: 'r7', requestNumber: 'REQ-0007', requesterId: 'juan', companyId: 'c1', departmentId: 'dCompras', status: 'INSERTADO_PROFIT', createdAt: D('2026-09-07'),
        approvals: [{ actorId: 'carlos', action: 'APPROVE', createdAt: D('2026-09-08') }] },
      { id: 'r8', requestNumber: 'REQ-0008', requesterId: 'juan', companyId: 'c1', departmentId: 'dCompras', status: 'RECHAZADO', createdAt: D('2026-09-08'),
        approvals: [{ actorId: 'maria', action: 'REJECT', createdAt: D('2026-09-09') }] },
      { id: 'r9', requestNumber: 'REQ-0009', requesterId: 'luis', companyId: 'c1', departmentId: 'dVentas', status: 'PENDIENTE_GERENTE', createdAt: D('2026-09-09') },
      { id: 'r10', requestNumber: 'REQ-0010', requesterId: 'juan', companyId: 'c1', departmentId: 'dCompras', status: 'DEVUELTO', createdAt: D('2026-09-10') },
    ],
  };
}

type UserCfg = {
  memberships: { companyId: string }[];
  perms: Record<string, string[]>;
  managed: { id: string; companyId: string }[];
  admin: boolean;
};

const USERS: Record<string, UserCfg> = {
  // Solicitante: solo las suyas.
  juan: {
    memberships: [{ companyId: 'c1' }],
    perms: { c1: ['REQUEST.CREATE', 'REQUEST.VIEW', 'DASHBOARD.VIEW'] },
    managed: [],
    admin: false,
  },
  // Solo Almacén en Empresa A (no ve Almacén de c2).
  w1: {
    memberships: [{ companyId: 'c1' }],
    perms: { c1: ['REQUEST.VIEW', 'WAREHOUSE.VIEW', 'WAREHOUSE.CLASSIFY', 'DASHBOARD.VIEW'] },
    managed: [],
    admin: false,
  },
  // Encargado de almacén.
  whm: {
    memberships: [{ companyId: 'c1' }],
    perms: { c1: ['REQUEST.VIEW', 'WAREHOUSE_MANAGER.VIEW', 'WAREHOUSE_MANAGER.APPROVE', 'DASHBOARD.VIEW'] },
    managed: [],
    admin: false,
  },
  // Contabilidad en c1.
  m1: {
    memberships: [{ companyId: 'c1' }],
    perms: { c1: ['REQUEST.VIEW', 'ACCOUNTING.VIEW', 'ACCOUNTING.APPROVE', 'DASHBOARD.VIEW'] },
    managed: [],
    admin: false,
  },
  // Gerente solo de Compras (c1) — no dirige Ventas.
  carlos: {
    memberships: [{ companyId: 'c1' }],
    perms: { c1: ['REQUEST.VIEW', 'MANAGER.APPROVE', 'DASHBOARD.VIEW'] },
    managed: [{ id: 'dCompras', companyId: 'c1' }],
    admin: false,
  },
  // Sin permisos de bandeja.
  f1: {
    memberships: [{ companyId: 'c1' }],
    perms: { c1: ['REQUEST.VIEW'] },
    managed: [],
    admin: false,
  },
  // Administrador máster: alcance global + todos los permisos de bandeja.
  admin: {
    memberships: [{ companyId: 'c1' }, { companyId: 'c2' }],
    perms: {
      c1: ['ADMIN.MANAGE', 'REQUEST.VIEW', 'DASHBOARD.VIEW', 'WAREHOUSE.VIEW', 'WAREHOUSE.CLASSIFY',
        'WAREHOUSE_MANAGER.VIEW', 'WAREHOUSE_MANAGER.APPROVE', 'ACCOUNTING.VIEW', 'ACCOUNTING.APPROVE',
        'MANAGER.APPROVE'],
      c2: ['ADMIN.MANAGE', 'REQUEST.VIEW', 'DASHBOARD.VIEW', 'WAREHOUSE.VIEW', 'WAREHOUSE.CLASSIFY',
        'WAREHOUSE_MANAGER.VIEW', 'WAREHOUSE_MANAGER.APPROVE', 'ACCOUNTING.VIEW', 'ACCOUNTING.APPROVE',
        'MANAGER.APPROVE'],
    },
    managed: [],
    admin: true,
  },
};

const MANAGERS: Record<string, { id: string; companyId: string }[]> = {
  carlos: [{ id: 'dCompras', companyId: 'c1' }],
};

function matchWhere(r: R, where: any): boolean {
  if (!where || Object.keys(where).length === 0) return true;
  if (where.AND && !where.AND.every((w: any) => matchWhere(r, w))) return false;
  if (where.OR && !where.OR.some((w: any) => matchWhere(r, w))) return false;
  if (where.requesterId !== undefined && r.requesterId !== where.requesterId) return false;
  if (where.companyId !== undefined) {
    if (typeof where.companyId === 'string') {
      if (r.companyId !== where.companyId) return false;
    } else if (where.companyId.in && !where.companyId.in.includes(r.companyId)) return false;
  }
  if (where.departmentId !== undefined) {
    if (typeof where.departmentId === 'string') {
      if (r.departmentId !== where.departmentId) return false;
    } else if (where.departmentId.in && !where.departmentId.in.includes(r.departmentId)) return false;
  }
  if (where.status !== undefined) {
    if (typeof where.status === 'string') {
      if (r.status !== where.status) return false;
    } else {
      if (where.status.in && !where.status.in.includes(r.status)) return false;
      if (where.status.notIn && where.status.notIn.includes(r.status)) return false;
    }
  }
  if (where.approvals?.some) {
    if (!(r.approvals ?? []).some(a => a.actorId === where.approvals.some.actorId)) return false;
  }
  if (where.id?.in && !where.id.in.includes(r.id)) return false;
  return true;
}

function mockPrisma(store: { requests: R[] }) {
  return {
    user: {
      findUnique: vi.fn(async ({ where }: any) => (USERS[where.id] ? { id: where.id, active: true } : null)),
    },
    department: {
      findMany: vi.fn(async ({ where }: any) => {
        if (!where?.managerId) return [];
        return (MANAGERS[where.managerId] ?? []).map(d => ({ ...d }));
      }),
    },
    request: {
      count: vi.fn(async (args: any = {}) => store.requests.filter(r => matchWhere(r, args.where)).length),
      groupBy: vi.fn(async (args: any) => {
        const rows = store.requests.filter(r => matchWhere(r, args.where));
        const map = new Map<string, number>();
        for (const r of rows) map.set(r.status, (map.get(r.status) ?? 0) + 1);
        return [...map.entries()].map(([status, n]) => ({ status, _count: { _all: n } }));
      }),
      findMany: vi.fn(async (args: any = {}) => {
        const rows = store.requests.filter(r => matchWhere(r, args.where));
        return rows.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? 25));
      }),
      findUnique: vi.fn(async ({ where }: any) => store.requests.find(r => r.id === where.id) ?? null),
    },
    approval: { findFirst: vi.fn(async () => null) },
    auditEvent: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
  } as any;
}

function mockAuth() {
  return {
    getMemberships: vi.fn(async (userId: string) =>
      USERS[userId].memberships.map(m => ({ companyId: m.companyId, departmentId: null }))),
    getEffectivePermissions: vi.fn(async (userId: string, companyId?: string) => {
      const u = USERS[userId];
      const permissions = companyId
        ? (u.perms[companyId] ?? [])
        : [...new Set(Object.values(u.perms).flat())];
      return { roleCodes: [], permissions };
    }),
  } as any;
}

function makeCounters(store: { requests: R[] }) {
  const requests = new SolicitudesService(
    mockPrisma(store),
    {} as any,
    {} as any,
    { emitMany: () => {} } as any,
    mockAuth(),
  );
  return new RequestCountersService((requests as any).prisma ?? mockPrisma(store), requests);
}

// El prisma del SolicitudesService es el mismo mock; reconstruir de forma
// explícita para asegurar que RequestCountersService use el mismo store.
function countersFor(store: { requests: R[] }) {
  const prisma = mockPrisma(store);
  const requests = new SolicitudesService(
    prisma,
    {} as any,
    {} as any,
    { emitMany: () => {} } as any,
    mockAuth(),
  );
  return new RequestCountersService(prisma, requests);
}

describe('RequestCountersService — resumen contextual', () => {
  it('solicitante: solo sus colas/historial, sin módulos ajenos en trabajo', async () => {
    const s = seed();
    const summary = await countersFor(s).getContextSummary('juan');
    // juan no tiene permisos de almacén/contabilidad/gerencia → colas 0.
    expect(summary.work.warehouse).toBe(0);
    expect(summary.work.warehouseApproval).toBe(0);
    expect(summary.work.accounting).toBe(0);
    expect(summary.work.approvals).toBe(0);
    expect(summary.work.total).toBe(0);
    expect(summary.dashboard.pending).toBe(0);
    // Historial propio: r7 completada, r8 rechazada + r10 devuelta.
    expect(summary.dashboard.completed).toBe(1);
    expect(summary.dashboard.returned).toBe(2);
    // En aprobación dentro de su alcance (propias activas en etapas humanas):
    // r1 (PENDIENTE_GERENTE propia), r5 (PENDIENTE_CONTABILIDAD propia).
    expect(summary.dashboard.inApproval).toBe(2);
  });

  it('Almacén en Empresa A: ve Almacén de c1, NO de c2, NO contabilidad', async () => {
    const s = seed();
    const summary = await countersFor(s).getContextSummary('w1');
    expect(summary.work.warehouse).toBe(1); // r2 de c1; r3 de c2 fuera de alcance
    expect(summary.work.accounting).toBe(0);
    expect(summary.work.approvals).toBe(0);
    expect(summary.work.total).toBe(1);
    expect(summary.dashboard.pending).toBe(1);
  });

  it('Aprobación Almacén: solo ALMACEN_APROBADO de su empresa', async () => {
    const s = seed();
    const summary = await countersFor(s).getContextSummary('whm');
    expect(summary.work.warehouse).toBe(0);
    expect(summary.work.warehouseApproval).toBe(1);
    expect(summary.work.accounting).toBe(0);
    expect(summary.work.total).toBe(1);
  });

  it('Contabilidad: separa aprobación vs Registro Profit', async () => {
    const s = seed();
    const summary = await countersFor(s).getContextSummary('m1');
    expect(summary.work.accountingApproval).toBe(1); // r5
    expect(summary.work.accountingProfitRegistration).toBe(1); // r6
    expect(summary.work.accounting).toBe(2);
    expect(summary.work.warehouse).toBe(0);
    expect(summary.work.total).toBe(2);
    expect(summary.dashboard.pending).toBe(2);
  });

  it('Gerente: solo PENDIENTE_GERENTE de departamentos que dirige', async () => {
    const s = seed();
    const summary = await countersFor(s).getContextSummary('carlos');
    // r1 (Compras, dirigido) sí; r9 (Ventas) no.
    expect(summary.work.approvals).toBe(1);
    expect(summary.work.managementApproval).toBe(1);
    expect(summary.work.warehouse).toBe(0);
    expect(summary.work.total).toBe(1);
  });

  it('Administrador: universo global de todas las colas', async () => {
    const s = seed();
    const summary = await countersFor(s).getContextSummary('admin');
    expect(summary.work.warehouse).toBe(2); // r2 + r3
    expect(summary.work.warehouseApproval).toBe(1);
    expect(summary.work.accountingApproval).toBe(1);
    expect(summary.work.accountingProfitRegistration).toBe(1);
    expect(summary.work.approvals).toBe(2); // r1 + r9
    expect(summary.work.total).toBe(2 + 1 + 1 + 1 + 2);
    // Hist global: r7 completada; r8 + r10 no exitosas.
    expect(summary.dashboard.completed).toBe(1);
    expect(summary.dashboard.returned).toBe(2);
  });

  it('Sin permisos de bandeja: todos los contadores de trabajo en 0', async () => {
    const s = seed();
    const summary = await countersFor(s).getContextSummary('f1');
    expect(summary.work).toMatchObject({
      total: 0,
      approvals: 0,
      warehouse: 0,
      warehouseApproval: 0,
      accounting: 0,
      accountingApproval: 0,
      accountingProfitRegistration: 0,
      managementApproval: 0,
    });
    expect(summary.dashboard.pending).toBe(0);
  });

  it('Dos usuarios distintos obtienen contadores distintos al mismo instante', async () => {
    const s = seed();
    const wh = await countersFor(s).getContextSummary('w1');
    const ac = await countersFor(s).getContextSummary('m1');
    expect(wh.work.warehouse).toBeGreaterThan(0);
    expect(ac.work.accounting).toBeGreaterThan(0);
    expect(wh.work.accounting).toBe(0);
    expect(ac.work.warehouse).toBe(0);
  });

  it('work.total no cuenta dos veces la misma solicitud (estados disjuntos)', async () => {
    const s = seed();
    const summary = await countersFor(s).getContextSummary('admin');
    const parts =
      summary.work.approvals
      + summary.work.warehouse
      + summary.work.warehouseApproval
      + summary.work.accounting;
    expect(summary.work.total).toBe(parts);
    // Ninguna solicitud aparece en dos colas a la vez.
    const statuses = s.requests.map(r => r.status);
    const queueStatuses = new Set([
      'PENDIENTE_GERENTE', 'PENDIENTE_ALMACEN', 'ALMACEN_APROBADO',
      'PENDIENTE_CONTABILIDAD', 'CONTABILIDAD_APROBADA', 'PROCESANDO_PROFIT', 'ERROR_PROFIT',
    ]);
    const inQueues = statuses.filter(st => queueStatuses.has(st));
    expect(inQueues).toHaveLength(7);
    expect(summary.work.total).toBe(7);
  });
});
