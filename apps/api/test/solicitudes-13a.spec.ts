import { describe, it, expect, vi } from 'vitest';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';

process.env.JWT_SECRET = 'test-secret-13a';

interface R {
  id: string; requestNumber: string; requesterId: string; companyId: string;
  departmentId: string; status: string; createdAt: Date;
  approvals?: { actorId: string; action: string; createdAt: Date }[];
  auditEvents?: { actorId: string; action: string; createdAt: Date }[];
}

const D = (s: string) => new Date(s);

function seed(): { requests: R[] } {
  return {
    requests: [
      { id: 'r1', requestNumber: 'REQ-0001', requesterId: 'juan', companyId: 'c1', departmentId: 'dCompras', status: 'PENDIENTE_GERENTE', createdAt: D('2026-09-01') },
      { id: 'r2', requestNumber: 'REQ-0002', requesterId: 'ana', companyId: 'c1', departmentId: 'dVentas', status: 'PENDIENTE_ALMACEN', createdAt: D('2026-09-02') },
      { id: 'r3', requestNumber: 'REQ-0003', requesterId: 'juan', companyId: 'c1', departmentId: 'dCompras', status: 'PENDIENTE_CONTABILIDAD', createdAt: D('2026-09-03'),
        approvals: [{ actorId: 'carlos', action: 'APPROVE', createdAt: D('2026-09-04') }] },
      { id: 'r4', requestNumber: 'REQ-0004', requesterId: 'juan', companyId: 'c1', departmentId: 'dCompras', status: 'RECHAZADO', createdAt: D('2026-09-05'),
        approvals: [{ actorId: 'maria', action: 'REJECT', createdAt: D('2026-09-06') }] },
      { id: 'r5', requestNumber: 'REQ-0005', requesterId: 'luis', companyId: 'c1', departmentId: 'dCompras', status: 'PENDIENTE_GERENTE', createdAt: D('2026-09-06') },
      { id: 'r6', requestNumber: 'REQ-0006', requesterId: 'ana', companyId: 'c1', departmentId: 'dVentas', status: 'APROBADO_FINAL', createdAt: D('2026-09-07'),
        approvals: [{ actorId: 'luis', action: 'APPROVE', createdAt: D('2026-09-08') }] },
    ],
  };
}

// Usuarios: juan/ana/luis requesters; carlos gerente Compras; w1 almacén; m1 contabilidad; f1 final; admin.
const USERS: Record<string, { memberships: { companyId: string }[]; perms: Record<string, string[]>; managed: { id: string; companyId: string }[]; admin: boolean }> = {
  juan: { memberships: [{ companyId: 'c1' }], perms: { c1: ['REQUEST.CREATE', 'REQUEST.VIEW'] }, managed: [], admin: false },
  ana: { memberships: [{ companyId: 'c1' }], perms: { c1: ['REQUEST.CREATE', 'REQUEST.VIEW'] }, managed: [], admin: false },
  luis: { memberships: [{ companyId: 'c1' }], perms: { c1: ['REQUEST.CREATE', 'REQUEST.VIEW', 'WAREHOUSE.CLASSIFY'] }, managed: [], admin: false },
  carlos: { memberships: [{ companyId: 'c1' }], perms: { c1: ['REQUEST.CREATE', 'REQUEST.VIEW', 'MANAGER.APPROVE'] }, managed: [{ id: 'dCompras', companyId: 'c1' }], admin: false },
  w1: { memberships: [{ companyId: 'c1' }], perms: { c1: ['REQUEST.VIEW', 'WAREHOUSE.CLASSIFY'] }, managed: [], admin: false },
  m1: { memberships: [{ companyId: 'c1' }], perms: { c1: ['REQUEST.VIEW', 'ACCOUNTING.APPROVE'] }, managed: [], admin: false },
  f1: { memberships: [{ companyId: 'c1' }], perms: { c1: ['REQUEST.VIEW', 'FINAL_REVIEW.APPROVE'] }, managed: [], admin: false },
  admin: { memberships: [{ companyId: 'c1' }], perms: { c1: ['ADMIN.MANAGE', 'REQUEST.VIEW'] }, managed: [], admin: true },
};

function matchWhere(r: R, where: any): boolean {
  if (!where || Object.keys(where).length === 0) return true;
  if (where.AND && !where.AND.every((w: any) => matchWhere(r, w))) return false;
  if (where.OR && !where.OR.some((w: any) => matchWhere(r, w))) return false;
  if (where.requesterId !== undefined && r.requesterId !== where.requesterId) return false;
  if (where.companyId !== undefined && r.companyId !== where.companyId) return false;
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
  if (where.createdAt?.gte && r.createdAt < new Date(where.createdAt.gte)) return false;
  if (where.createdAt?.lte && r.createdAt > new Date(where.createdAt.lte)) return false;
  if (where.requestNumber?.contains || where.requestedDescription?.contains || where.purpose?.contains) {
    const q = where.requestNumber?.contains ?? where.requestedDescription?.contains ?? where.purpose?.contains ?? '';
    if (q && !(r.requestNumber.includes(q) || (r as any).requestedDescription?.includes(q))) return false;
  }
  return true;
}

const MANAGERS: Record<string, { id: string; companyId: string }[]> = {
  carlos: [{ id: 'dCompras', companyId: 'c1' }],
};

function mockPrisma(store: { requests: R[] }) {
  return {
    user: { findUnique: vi.fn(async ({ where }: any) => (USERS[where.id] ? { id: where.id, active: true } : null)) },
    department: {
      findMany: vi.fn(async ({ where }: any) => {
        if (!where?.managerId) return [];
        return (MANAGERS[where.managerId] ?? []).map(d => ({ ...d }));
      }),
    },
    request: {
      findMany: vi.fn(async (args: any) => {
        const rows = store.requests.filter(r => matchWhere(r, args.where));
        return rows.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? 25));
      }),
      count: vi.fn(async (args: any = {}) => store.requests.filter(r => matchWhere(r, args.where)).length),
      findUnique: vi.fn(async ({ where }: any) => store.requests.find(r => r.id === where.id) ?? null),
    },
    approval: {
      findFirst: vi.fn(async ({ where }: any) => {
        const r = store.requests.find(x => x.id === where.requestId);
        return r?.approvals?.find(a => a.actorId === where.actorId) ? { id: 'a1' } : null;
      }),
    },
    auditEvent: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
  } as any;
}

function mockAuth() {
  return {
    getMemberships: vi.fn(async (userId: string) => USERS[userId].memberships.map(m => ({ companyId: m.companyId, departmentId: null }))),
    getEffectivePermissions: vi.fn(async (userId: string, companyId?: string) => {
      const u = USERS[userId];
      const permissions = companyId ? (u.perms[companyId] ?? []) : [...new Set(Object.values(u.perms).flat())];
      return { roleCodes: [], permissions: u.admin ? [...permissions, 'ADMIN.MANAGE'] : permissions };
    }),
  } as any;
}

const svc = (store: { requests: R[] }) =>
  new SolicitudesService(mockPrisma(store), {} as any, {} as any, { emitMany: () => {} } as any, mockAuth());

const ids = (res: any) => res.items.map((r: any) => r.id).sort();

describe('13A — visibilidad server-side', () => {
  it('requester ve solo las propias (activas e historial con rechazadas)', async () => {
    const s = seed();
    const act: any = await svc(s).findScoped('juan', { scope: 'activas' });
    expect(ids(act)).toEqual(['r1', 'r3']);
    expect(act.total).toBe(2);
    const hist: any = await svc(s).findScoped('juan', { scope: 'historial' });
    expect(ids(hist)).toEqual(['r1', 'r3', 'r4']);
    const r4 = hist.items.find((r: any) => r.id === 'r4');
    expect(r4.miParticipacion).toMatchObject({ accion: 'Creé' });
  });

  it('requester no ve solicitudes ajenas ni con filtro ajeno', async () => {
    const s = seed();
    const hist: any = await svc(s).findScoped('juan', { scope: 'historial', requesterId: 'ana' });
    expect(hist.items).toHaveLength(0);
    expect(hist.filteredTotal).toBe(0);
    await expect(svc(s).findOne('r2', 'juan')).rejects.toThrow(/not found/);
  });

  it('gerente ve PENDIENTE_GERENTE de su depto; tras aprobar sale de pendientes y entra a historial', async () => {
    const s = seed();
    const act: any = await svc(s).findScoped('carlos', { scope: 'activas' });
    expect(ids(act)).toEqual(['r1', 'r5']);
    // simula aprobación de r1 por carlos → avanza a almacén
    s.requests.find(r => r.id === 'r1')!.status = 'PENDIENTE_ALMACEN';
    s.requests.find(r => r.id === 'r1')!.approvals = [{ actorId: 'carlos', action: 'APPROVE', createdAt: D('2026-09-09') }];
    const act2: any = await svc(s).findScoped('carlos', { scope: 'activas' });
    expect(ids(act2)).toEqual(['r5']);
    const hist: any = await svc(s).findScoped('carlos', { scope: 'historial' });
    const r1 = hist.items.find((r: any) => r.id === 'r1');
    expect(r1).toBeTruthy();
    expect(r1.miParticipacion).toMatchObject({ accion: 'Aprobé' });
    expect(r1.status).toBe('PENDIENTE_ALMACEN');
  });

  it('almacén ve cola general sin filtro de departamento; otro sin participación no la hereda', async () => {
    const s = seed();
    const act: any = await svc(s).findScoped('w1', { scope: 'activas' });
    expect(ids(act)).toEqual(['r2']);
    const histAna: any = await svc(s).findScoped('ana', { scope: 'historial' });
    // ana es solicitante de r2 → la ve por ser propia (no por historial ajeno)
    expect(ids(histAna)).toContain('r2');
    const histLuis: any = await svc(s).findScoped('luis', { scope: 'historial' });
    expect(ids(histLuis)).not.toContain('r2');
  });

  it('contabilidad y final ven sus colas; admin ve todo', async () => {
    const s = seed();
    expect(ids(await svc(s).findScoped('m1', { scope: 'activas' }))).toEqual(['r3']);
    expect(ids(await svc(s).findScoped('f1', { scope: 'activas' }))).toEqual([]);
    const adminAct: any = await svc(s).findScoped('admin', { scope: 'activas' });
    expect(adminAct.total).toBe(6);
    const adminHist: any = await svc(s).findScoped('admin', { scope: 'historial' });
    expect(adminHist.total).toBe(6);
  });

  it('resumen con contadores server-side', async () => {
    const s = seed();
    const r: any = await svc(s).resumen('juan');
    expect(r).toMatchObject({ activas: 2, historial: 3, completadas: 0, rechazadas: 1, enProceso: 2 });
  });

  it('paginación con envelope', async () => {
    const s = seed();
    const p1: any = await svc(s).findScoped('admin', { scope: 'activas', limit: 25, page: 1 });
    expect(p1).toMatchObject({ total: 6, filteredTotal: 6, page: 1, limit: 25 });
    expect(p1.items).toHaveLength(6);
  });

  it('detalle fuera de alcance → 404 (jefe otro depto, almacén fuera de cola)', async () => {
    const s = seed();
    await expect(svc(s).findOne('r2', 'carlos')).rejects.toThrow(/not found/);
    await expect(svc(s).findOne('r3', 'w1')).rejects.toThrow(/not found/);
    await expect(svc(s).getHistory('r2', 'juan')).rejects.toThrow(/not found/);
  });

  it('participante conserva acceso al detalle (solicitante siempre)', async () => {
    const s = seed();
    const r: any = await svc(s).findOne('r4', 'juan');
    expect(r.id).toBe('r4');
    const r3: any = await svc(s).findOne('r3', 'carlos');
    expect(r3.id).toBe('r3');
  });
});
