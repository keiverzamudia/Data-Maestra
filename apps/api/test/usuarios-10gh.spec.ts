import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../src/modulos/autenticacion/rbac.guard';
import { AutenticacionService } from '../src/modulos/autenticacion/autenticacion.service';
import { UsuariosService } from '../src/modulos/usuarios/usuarios.service';
import { UsuariosController } from '../src/modulos/usuarios/usuarios.controller';
import { ProfitUserSyncScheduler } from '../src/modulos/usuarios/profit-user-sync.scheduler';
import { resolveEffectivePermissions } from '../src/comun/utilidades/permisos-efectivos';

process.env.JWT_SECRET = 'test-secret-10gh';

function baseUser(over: any = {}) {
  return {
    id: 'u1', username: 'j.perez', displayName: 'Juan Pérez', email: null,
    profitCode: null, active: true, mustChangePassword: false,
    lastLoginAt: null, passwordChangedAt: null, ...over,
  };
}

function mockPrisma(o: any = {}) {
  return {
    user: {
      findUnique: vi.fn(async ({ where }: any) => (o.userFetch ? o.userFetch(where) : (o.user ?? baseUser()))),
      update: vi.fn(async ({ data }: any) => ({ ...baseUser(), ...o.user, ...data })),
    },
    userRole: {
      findMany: vi.fn(async () => o.roles ?? []),
      findFirst: vi.fn(async () => o.roleFirst ?? null),
      create: vi.fn(async ({ data }: any) => ({ id: 'ur1', ...data })),
      update: vi.fn(async () => ({})),
    },
    role: { findUnique: vi.fn(async ({ where }: any) => (o.roleFetch ? o.roleFetch(where) : ({ id: 'r1', code: where.code }))) },
    company: { findUnique: vi.fn(async ({ where }: any) => (o.companyFetch ? o.companyFetch(where) : ({ id: where.id, code: 'EMP-A' }))) },
    department: { findUnique: vi.fn(async ({ where }: any) => (o.deptFetch ? o.deptFetch(where) : null)) },
    permission: {
      findUnique: vi.fn(async ({ where }: any) => (o.permFetch ? o.permFetch(where) : ({ id: 'p1', code: where.code }))),
      findMany: vi.fn(async () => (o.catalog ?? []).map((code: string) => ({ code }))),
    },
    userPermissionOverride: {
      findMany: vi.fn(async () => o.overrides ?? []),
      findUnique: vi.fn(async () => o.overrideOne ?? null),
      upsert: vi.fn(async ({ create }: any) => create),
      delete: vi.fn(async () => ({})),
    },
    session: { updateMany: vi.fn(async () => ({ count: 1 })) },
    profitUserSyncRun: {
      create: vi.fn(async () => ({ id: 'run-1' })),
      update: vi.fn(async () => ({})),
    },
    $transaction: vi.fn(async (cb: any) => cb({
      user: {
        create: vi.fn(async ({ data }: any) => { (o.txCalls ?? (o.txCalls = [])).push({ op: 'user.create', data }); return { id: 'n1', ...data }; }),
        update: vi.fn(async ({ data }: any) => { (o.txCalls ?? (o.txCalls = [])).push({ op: 'user.update', data }); return {}; }),
      },
    })),
  } as any;
}

const auditoria = () => ({ logEvent: vi.fn(async () => ({})) }) as any;
const svc = (o: any = {}) => new UsuariosService(mockPrisma(o), (o.profitAdapter ?? {}) as any, auditoria());

function roleRow(code: string, perms: string[]) {
  return { role: { code, rolePermissions: perms.map(p => ({ permission: { code: p } })) } };
}

describe('10G — permisos individuales', () => {
  it('1. permiso heredado desde rol', () => {
    const r = resolveEffectivePermissions(['REQUEST.CREATE'], []);
    expect(r.permissions).toEqual(['REQUEST.CREATE']);
    expect(r.detail).toEqual([{ code: 'REQUEST.CREATE', source: 'HEREDADO', granted: true }]);
  });

  it('2. override concedido agrega permiso', () => {
    const r = resolveEffectivePermissions(['REQUEST.VIEW'], [{ code: 'ADMIN.MANAGE', effect: 'GRANT' }]);
    expect(r.permissions).toContain('ADMIN.MANAGE');
    expect(r.detail.find(d => d.code === 'ADMIN.MANAGE')).toEqual({ code: 'ADMIN.MANAGE', source: 'CONCEDIDO', granted: true });
  });

  it('3. override denegado quita permiso heredado', () => {
    const r = resolveEffectivePermissions(['AUDIT.VIEW'], [{ code: 'AUDIT.VIEW', effect: 'DENY' }]);
    expect(r.permissions).not.toContain('AUDIT.VIEW');
    expect(r.detail.find(d => d.code === 'AUDIT.VIEW')).toEqual({ code: 'AUDIT.VIEW', source: 'DENEGADO', granted: false });
  });

  it('4. DENEGADO gana sobre CONCEDIDO', () => {
    const r = resolveEffectivePermissions([], [
      { code: 'ADMIN.MANAGE', effect: 'GRANT' },
      { code: 'ADMIN.MANAGE', effect: 'DENY' },
    ]);
    expect(r.permissions).not.toContain('ADMIN.MANAGE');
    expect(r.detail.find(d => d.code === 'ADMIN.MANAGE')?.source).toBe('DENEGADO');
  });

  it('5. eliminar override vuelve al estado heredado', async () => {
    const o: any = { overrideOne: { id: 'ov1', effect: 'DENY' } };
    const prisma = mockPrisma(o);
    const s = new UsuariosService(prisma, {} as any, auditoria());
    const res = await s.removeOverride('u1', 'AUDIT.VIEW', 'u-admin');
    expect(res).toEqual({ ok: true });
    expect(prisma.userPermissionOverride.delete).toHaveBeenCalledTimes(1);
  });

  it('6. sin ADMIN.MANAGE no puede modificar overrides (403 por metadata+guard)', () => {
    const reflector = new Reflector();
    const read = (m: string) =>
      reflector.getAllAndOverride<string[]>('require_permission', [
        UsuariosController.prototype[m],
        UsuariosController,
      ]) ?? [];
    expect(read('fijarOverride')).toContain('ADMIN.MANAGE');
    expect(read('quitarOverride')).toContain('ADMIN.MANAGE');
    const guard = new RbacGuard(reflector);
    const ctx: any = {
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', permissions: ['REQUEST.VIEW'] } }) }),
      getHandler: () => UsuariosController.prototype['fijarOverride'],
      getClass: () => UsuariosController,
    };
    expect(() => guard.canActivate(ctx)).toThrow(/ADMIN.MANAGE/);
  });

  it('7. con ADMIN.MANAGE sí puede (servicio + auditoría)', async () => {
    const o: any = {};
    const prisma = mockPrisma(o);
    const aud = auditoria();
    const s = new UsuariosService(prisma, {} as any, aud);
    await s.setOverride('u1', { permissionCode: 'ADMIN.MANAGE', effect: 'GRANT' }, 'u-admin');
    expect(prisma.userPermissionOverride.upsert).toHaveBeenCalledTimes(1);
    expect(aud.logEvent.mock.calls[0][0].action).toBe('USER_PERMISSION_GRANTED');
  });

  it('nadie modifica sus propios overrides', async () => {
    const s = svc();
    await expect(s.setOverride('u-admin', { permissionCode: 'X', effect: 'GRANT' }, 'u-admin')).rejects.toThrow(/propios/);
    await expect(s.removeOverride('u-admin', 'X', 'u-admin')).rejects.toThrow(/propios/);
  });
});

describe('10H — administración de usuarios', () => {
  it('8. detalle sin passwordHash, con membresías y permisos efectivos', async () => {
    const o: any = {
      roles: [{ ...roleRow('REQUESTER', ['REQUEST.VIEW']), company: { id: 'c1', name: 'E', code: 'EMP-A' }, department: null, role: { code: 'REQUESTER', name: 'S' } }],
      catalog: ['ADMIN.MANAGE', 'REQUEST.VIEW'],
    };
    const prisma = mockPrisma(o);
    // detalle usa user.findUnique con include: devolver usuario + arreglos
    prisma.user.findUnique = vi.fn(async () => ({
      ...baseUser(), userRoles: [], permissionOverrides: [],
    }));
    const s = new UsuariosService(prisma, {} as any, auditoria());
    const d: any = await s.getDetalle('u1');
    expect(d).not.toHaveProperty('passwordHash');
    expect(d.displayName).toBe('Juan Pérez');
    expect(d.permissionCatalog).toContain('ADMIN.MANAGE');
    expect(Array.isArray(d.effectivePermissions)).toBe(true);
  });

  it('9/10. activar y desactivar auditan; autodesactivación bloqueada', async () => {
    const prisma = mockPrisma({});
    const aud = auditoria();
    const s = new UsuariosService(prisma, {} as any, aud);
    await s.setActive('u1', false, 'u-admin');
    expect(aud.logEvent.mock.calls[0][0].action).toBe('USER_DEACTIVATED');
    await s.setActive('u1', true, 'u-admin');
    expect(aud.logEvent.mock.calls[1][0].action).toBe('USER_ACTIVATED');
    await expect(s.setActive('u-admin', false, 'u-admin')).rejects.toThrow(/propio/);
  });

  it('11. usuario inactivo no puede login', async () => {
    const prisma: any = {
      user: { findUnique: vi.fn(async () => baseUser({ id: 'u-off', active: false, passwordHash: 'x' })) },
      auditEvent: { create: vi.fn(async () => ({})) },
    };
    const auth = new AutenticacionService(prisma);
    await expect(auth.loginReal({ userId: 'u-off', password: 'cualquiera' }, '1.1.1.1', 'UA')).rejects.toThrow(/incorrectos/);
  });

  it('12/14. asignación de rol con empresa/departamento válidos', async () => {
    const o: any = {
      deptFetch: ({ id }: any) => (id === 'd1' ? { id: 'd1', companyId: 'c1' } : null),
    };
    const prisma = mockPrisma(o);
    const aud = auditoria();
    const s = new UsuariosService(prisma, {} as any, aud);
    const res = await s.assignRole('u1', { roleCode: 'WAREHOUSE', companyId: 'c1', departmentId: 'd1' }, 'u-admin');
    expect(res).toEqual({ ok: true });
    expect(prisma.userRole.create).toHaveBeenCalledTimes(1);
    expect(aud.logEvent.mock.calls[0][0].action).toBe('USER_ROLE_ASSIGNED');
  });

  it('13. eliminación de rol desactiva sin borrar', async () => {
    const o: any = { roleFirst: { id: 'ur1' } };
    const prisma = mockPrisma(o);
    const aud = auditoria();
    const s = new UsuariosService(prisma, {} as any, aud);
    await s.removeRole('u1', { roleCode: 'WAREHOUSE', companyId: 'c1', departmentId: null }, 'u-admin');
    expect(prisma.userRole.update).toHaveBeenCalledWith({ where: { id: 'ur1' }, data: { active: false } });
    expect(aud.logEvent.mock.calls[0][0].action).toBe('USER_ROLE_REMOVED');
  });

  it('15. empresa/departamento incompatibles → 400', async () => {
    const o: any = { deptFetch: () => ({ id: 'd9', companyId: 'c-otro' }) };
    const s = svc(o);
    await expect(
      s.assignRole('u1', { roleCode: 'WAREHOUSE', companyId: 'c1', departmentId: 'd9' }, 'u-admin'),
    ).rejects.toThrow(/no pertenece/);
  });

  it('16/17/18. reset: hash NULL + mustChange + sesiones revocadas', async () => {
    const prisma = mockPrisma({});
    const aud = auditoria();
    const s = new UsuariosService(prisma, {} as any, aud);
    const res = await s.resetPassword('u1', 'u-admin');
    expect(res).toEqual({ ok: true, mustChangePassword: true });
    const upd = prisma.user.update.mock.calls[0][0];
    expect(upd.data.passwordHash).toBeNull();
    expect(upd.data.mustChangePassword).toBe(true);
    expect(prisma.session.updateMany).toHaveBeenCalledTimes(1);
    const sessArgs = prisma.session.updateMany.mock.calls[0][0];
    expect(sessArgs.where).toEqual({ userId: 'u1', revokedAt: null });
    expect(sessArgs.data.revokedAt).toBeInstanceOf(Date);
    expect(aud.logEvent.mock.calls[0][0].action).toBe('USER_PASSWORD_RESET');
    expect(JSON.stringify(aud.logEvent.mock.calls[0][0])).not.toContain('passwordHash');
  });
});

describe('Sync — misma función manual/scheduler + reglas locales', () => {
  it('19. scheduler y controller usan synchronize()', async () => {
    const calls: string[] = [];
    const serviceMock: any = { synchronize: vi.fn(async () => { calls.push('sync'); return { runId: 'r' }; }) };
    const sched = new ProfitUserSyncScheduler(serviceMock, { get: (k: string, d: any) => d } as any);
    (sched as any).running = false;
    // evitar reprogramación real en test
    (sched as any).scheduleNext = () => undefined;
    expect(await sched.tick()).toBe('ok');
    expect(serviceMock.synchronize).toHaveBeenCalledTimes(1);
    const ctrl = new UsuariosController(serviceMock, { getMemberships: vi.fn(async () => []) } as any);
    await ctrl.sincronizarProfit({ id: 'u5', displayName: 'A', sessionId: 's', roleCodes: [], permissions: [] });
    expect(serviceMock.synchronize).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(['sync', 'sync']);
  });

  it('20/21. nuevo sin organización; existente conserva config (solo displayName)', async () => {
    const o: any = {};
    const prisma = mockPrisma(o);
    // local con profitCode (existente) + otro sin tocar
    const local = [
      { id: 'u10', profitCode: 'KZAMU', displayName: 'VIEJO', active: true },
    ];
    prisma.user.findMany = vi.fn(async () => local);
    const adapter: any = { getProfitUsers: vi.fn(async () => [{ profitCode: 'KZAMU', displayName: 'KEIBER ZAMUDIA' }, { profitCode: 'NUEVO', displayName: 'Nuevo Uno' }]) };
    const s = new UsuariosService(prisma, adapter, auditoria());
    const r = await s.synchronize('u5', 'c1');
    expect(r.created).toBe(1);
    expect(r.updated).toBe(1);
    const created = o.txCalls.find((c: any) => c.op === 'user.create');
    expect(created.data).not.toHaveProperty('companyId');
    expect(created.data).not.toHaveProperty('departmentId');
    expect(Object.keys(created.data)).not.toContain('passwordHash');
    const updated = o.txCalls.find((c: any) => c.op === 'user.update');
    expect(Object.keys(updated.data).sort()).toEqual(['displayName']);
  });

  it('22. ausente de Profit queda inactivo sin borrar', async () => {
    const o: any = {};
    const prisma = mockPrisma(o);
    prisma.user.findMany = vi.fn(async () => [{ id: 'u10', profitCode: 'VIEJO', displayName: 'Viejo', active: true }]);
    const adapter: any = { getProfitUsers: vi.fn(async () => []) };
    const s = new UsuariosService(prisma, adapter, auditoria());
    const r = await s.synchronize('u5', 'c1');
    expect(r.missing).toBe(1);
    const updated = o.txCalls.find((c: any) => c.op === 'user.update');
    expect(updated.data).toEqual({ active: false });
  });

  it('24. ejecución concurrente bloqueada', async () => {
    let release!: () => void;
    const gate = new Promise<void>(res => { release = res; });
    const serviceMock: any = { synchronize: vi.fn(async () => { await gate; return {}; }) };
    const sched = new ProfitUserSyncScheduler(serviceMock, { get: (k: string, d: any) => d } as any);
    (sched as any).scheduleNext = () => undefined;
    const first = sched.tick();
    const second = await sched.tick();
    expect(second).toBe('skipped-concurrent');
    release();
    expect(await first).toBe('ok');
    expect(serviceMock.synchronize).toHaveBeenCalledTimes(1);
  });
});
