import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UsuariosService } from '../src/modulos/usuarios/usuarios.service';
import { UsuariosController } from '../src/modulos/usuarios/usuarios.controller';

interface LocalUser {
  id: string;
  profitCode: string | null;
  displayName: string;
  active: boolean;
}

function createMocks(initialLocal: LocalUser[], profitUsers: { profitCode: string; displayName: string }[], failCodes: string[] = []) {
  const local: LocalUser[] = initialLocal.map(u => ({ ...u }));
  const calls: { op: string; args: any }[] = [];
  let idSeq = 100;

  const tx = {
    user: {
      create: vi.fn(async ({ data }: any) => {
        calls.push({ op: 'user.create', args: data });
        if (failCodes.includes(data.profitCode)) throw new Error('db fail');
        const row: LocalUser = { id: `u${idSeq++}`, profitCode: data.profitCode ?? null, displayName: data.displayName, active: data.active ?? true };
        local.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        calls.push({ op: 'user.update', args: { where, data } });
        const row = local.find(u => u.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      delete: vi.fn(async () => {
        calls.push({ op: 'user.delete', args: {} });
        throw new Error('must never delete');
      }),
    },
  };

  const prisma: any = {
    user: {
      findMany: vi.fn(async () => local.filter(u => u.profitCode !== null).map(u => ({ ...u }))),
    },
    profitUserSyncRun: {
      create: vi.fn(async () => ({ id: 'run-1' })),
      update: vi.fn(async () => ({ id: 'run-1' })),
    },
    $transaction: vi.fn(async (cb: any) => cb(tx)),
  };
  const adapter: any = { getProfitUsers: vi.fn(async () => profitUsers.map(u => ({ ...u }))) };
  const auditoria: any = { logEvent: vi.fn(async () => ({})) };
  return { prisma, tx, adapter, auditoria, calls, local };
}

describe('FASE 10C — GET /usuarios?search= (autocompletado login 10D)', () => {
  it('busca por displayName y nunca expone passwordHash', async () => {
    const rows = [
      { id: 'a', username: 'KZAMU', displayName: 'KEIBER ZAMUDIA', profitCode: 'KZAMU', active: true, mustChangePassword: true, lastLoginAt: null },
    ];
    const prisma: any = { user: { findMany: vi.fn(async () => rows) }, profitUserSyncRun: {}, $transaction: vi.fn() };
    const svc = new UsuariosService(prisma, {} as any, {} as any);
    const auth: any = { getSession: () => ({ id: 'u5', company: { id: 'c1' } }) };
    const ctrl = new UsuariosController(svc, auth);
    const res = await ctrl.buscar('KEI', undefined);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.displayName).toEqual({ contains: 'KEI' });
    const sel = prisma.user.findMany.mock.calls[0][0].select;
    expect(sel).not.toHaveProperty('passwordHash');
    expect(res[0].displayName).toBe('KEIBER ZAMUDIA');
    expect(res[0].profitCode).toBe('KZAMU');
  });

  it('sincronizar pasa el actor real (@CurrentUser) a la auditoría', async () => {
    const svc: any = { synchronize: vi.fn(async () => ({ created: 0 })) };
    const auth: any = {
      getMemberships: vi.fn(async () => [{ companyId: 'c1' }]),
    };
    const ctrl = new UsuariosController(svc, auth);
    await ctrl.sincronizarProfit({ id: 'u5', displayName: 'X', sessionId: 's1', roleCodes: [], permissions: [] });
    expect(auth.getMemberships).toHaveBeenCalledWith('u5');
    expect(svc.synchronize).toHaveBeenCalledWith('u5', 'c1');
  });
});
describe('FASE 10C — Sincronización de usuarios Profit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('crea usuario nuevo con profitCode/displayName y sin passwordHash', async () => {
    const m = createMocks([], [{ profitCode: '02', displayName: 'JOSE MARTINEZ' }]);
    const svc = new UsuariosService(m.prisma, m.adapter, m.auditoria);
    const r = await svc.synchronize('u5', 'c1');
    expect(r.created).toBe(1);
    expect(r.totalProfit).toBe(1);
    const created = m.calls.find(c => c.op === 'user.create')!;
    expect(created.args.profitCode).toBe('02');
    expect(created.args.displayName).toBe('JOSE MARTINEZ');
    expect(created.args).not.toHaveProperty('passwordHash');
    expect(m.local[0]).toMatchObject({ profitCode: '02', active: true });
  });

  it('no duplica usuario existente sin cambios', async () => {
    const m = createMocks(
      [{ id: 'u10', profitCode: '02', displayName: 'JOSE MARTINEZ', active: true }],
      [{ profitCode: '02', displayName: 'JOSE MARTINEZ' }],
    );
    const svc = new UsuariosService(m.prisma, m.adapter, m.auditoria);
    const r = await svc.synchronize('u5', 'c1');
    expect(r.created).toBe(0);
    expect(r.updated).toBe(0);
    expect(r.missing).toBe(0);
    expect(m.calls.filter(c => c.op.startsWith('user.'))).toHaveLength(0);
  });

  it('actualiza solo displayName y no toca passwordHash/roles/empresa', async () => {
    const m = createMocks(
      [{ id: 'u10', profitCode: '02', displayName: 'JOSE VIEJO', active: true }],
      [{ profitCode: '02', displayName: 'JOSE MARTINEZ' }],
    );
    const svc = new UsuariosService(m.prisma, m.adapter, m.auditoria);
    const r = await svc.synchronize('u5', 'c1');
    expect(r.updated).toBe(1);
    const upd = m.calls.find(c => c.op === 'user.update')!;
    expect(Object.keys(upd.args.data)).toEqual(['displayName']);
    // Sin toques a roles/permisos/empresa/departamento: solo user.* y syncRun
    for (const c of m.calls) {
      expect(['user.create', 'user.update'].includes(c.op)).toBe(true);
    }
  });

  it('ausente de Profit se desactiva sin eliminarse', async () => {
    const m = createMocks(
      [{ id: 'u10', profitCode: 'XX', displayName: 'EX EMPLEADO', active: true }],
      [{ profitCode: '02', displayName: 'JOSE MARTINEZ' }],
    );
    const svc = new UsuariosService(m.prisma, m.adapter, m.auditoria);
    const r = await svc.synchronize('u5', 'c1');
    expect(r.missing).toBe(1);
    const upd = m.calls.find(c => c.op === 'user.update' && c.args.data.active === false)!;
    expect(upd).toBeTruthy();
    expect(m.tx.user.delete).not.toHaveBeenCalled();
    expect(m.local.find(u => u.id === 'u10')).toBeTruthy();
  });

  it('registra ProfitUserSyncRun y auditoría', async () => {
    const m = createMocks([], [{ profitCode: '02', displayName: 'JOSE MARTINEZ' }]);
    const svc = new UsuariosService(m.prisma, m.adapter, m.auditoria);
    const r = await svc.synchronize('u5', 'c1');
    expect(m.prisma.profitUserSyncRun.create).toHaveBeenCalledTimes(1);
    const updCall = m.prisma.profitUserSyncRun.update.mock.calls[0][0];
    expect(updCall.data.created).toBe(1);
    expect(updCall.data.finishedAt).toBeInstanceOf(Date);
    expect(m.auditoria.logEvent).toHaveBeenCalledTimes(1);
    const audit = m.auditoria.logEvent.mock.calls[0][0];
    expect(audit.action).toBe('PROFIT_USER_SYNC');
    expect(audit.actorId).toBe('u5');
    expect(audit.afterData).toContain('"created":1');
  });

  it('es idempotente: segunda corrida sin cambios produce 0 cambios', async () => {
    const m = createMocks([], [{ profitCode: '02', displayName: 'JOSE MARTINEZ' }]);
    const svc = new UsuariosService(m.prisma, m.adapter, m.auditoria);
    const r1 = await svc.synchronize('u5', 'c1');
    expect(r1.created).toBe(1);
    m.calls.length = 0;
    const r2 = await svc.synchronize('u5', 'c1');
    expect(r2.created).toBe(0);
    expect(r2.updated).toBe(0);
    expect(r2.missing).toBe(0);
    expect(r2.errors).toBe(0);
    expect(m.calls.filter(c => c.op.startsWith('user.'))).toHaveLength(0);
  });

  it('errores por usuario quedan registrados sin abortar el resto', async () => {
    const m = createMocks(
      [],
      [
        { profitCode: '02', displayName: 'JOSE MARTINEZ' },
        { profitCode: 'BAD', displayName: 'ROMPE TODO' },
      ],
      ['BAD'],
    );
    const svc = new UsuariosService(m.prisma, m.adapter, m.auditoria);
    const r = await svc.synchronize('u5', 'c1');
    expect(r.created).toBe(1);
    expect(r.errors).toBe(1);
    const updCall = m.prisma.profitUserSyncRun.update.mock.calls[0][0];
    expect(updCall.data.errors).toBe(1);
    expect(updCall.data.details).toContain('BAD');
  });

  it('falla de Profit registra corrida fallida, audita, NO toca locales y propaga 503', async () => {
    const m = createMocks(
      [{ id: 'u10', profitCode: 'KZAMU', displayName: 'KEIBER ZAMUDIA', active: true }],
      [],
    );
    m.adapter.getProfitUsers = vi.fn(async () => { throw new Error('timeout'); });
    const svc = new UsuariosService(m.prisma, m.adapter, m.auditoria);
    await expect(svc.synchronize('u5', 'c1')).rejects.toThrow(/ProfitUserSync failed/);
    const updCall = m.prisma.profitUserSyncRun.update.mock.calls[0][0];
    expect(updCall.data.errors).toBe(1);
    expect(m.auditoria.logEvent.mock.calls[0][0].action).toBe('PROFIT_USER_SYNC_FAILED');
    // Caída de Profit ≠ usuarios desaparecidos: cero escrituras en users
    expect(m.calls.filter(c => c.op.startsWith('user.'))).toHaveLength(0);
    expect(m.local.find(u => u.id === 'u10')!.active).toBe(true);
  });

  it('VUSUARIOS es la única fuente y getProfitUsers es SELECT sin secretos', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('src/modulos/profit/profit-adapter.service.ts', 'utf-8');
    const start = content.indexOf('async getProfitUsers');
    expect(start).toBeGreaterThan(-1);
    const body = content.slice(start, content.indexOf('\n  }\n', start));
    expect(body).toContain('SELECT');
    expect(body).toContain('MasterProfit.dbo.VUSUARIOS');
    expect(body).not.toContain('TVendedores');
    expect(body).not.toContain('dbo.vendedor');
    expect(body).not.toMatch(/INSERT|UPDATE|DELETE|MERGE/i);
    expect(body).not.toMatch(/password|login|email/i);
  });

  it('reactiva vía sync al reaparecer en VUSUARIOS', async () => {
    const m = createMocks(
      [{ id: 'u10', profitCode: 'KZAMU', displayName: 'KEIBER ZAMUDIA', active: false }],
      [{ profitCode: 'KZAMU', displayName: 'KEIBER ZAMUDIA' }],
    );
    const svc = new UsuariosService(m.prisma, m.adapter, m.auditoria);
    const r = await svc.synchronize('u5', 'c1');
    expect(r.updated).toBe(1);
    expect(r.missing).toBe(0);
    const upd = m.calls.find(c => c.op === 'user.update')!;
    expect(upd.args.data.active).toBe(true);
    expect(m.local.find(u => u.id === 'u10')!.active).toBe(true);
  });
});
