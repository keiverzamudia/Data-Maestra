import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../src/modulos/autenticacion/rbac.guard';
import { AutenticacionService } from '../src/modulos/autenticacion/autenticacion.service';
import { RolesService } from '../src/modulos/roles/roles.service';
import { RolesController } from '../src/modulos/roles/roles.controller';

process.env.JWT_SECRET = 'test-secret-10i';

interface Store {
  roles: Array<{ id: string; code: string; name: string; description: string | null }>;
  perms: Array<{ id: string; code: string }>;
  links: Set<string>; // "roleId:permId"
  userRoles: Array<{ userId: string; roleId: string; active: boolean }>;
  overrides: Array<{ userId: string; permissionId: string; effect: string }>;
  users: Record<string, { active: boolean }>;
  audit: string[];
}

function seedStore(): Store {
  return {
    roles: [
      { id: 'r1', code: 'REQUESTER', name: 'Solicitante', description: null },
      { id: 'r6', code: 'MASTER_DATA_ADMIN', name: 'Admin MDM', description: null },
    ],
    perms: [
      { id: 'p1', code: 'REQUEST.VIEW' },
      { id: 'p2', code: 'ADMIN.MANAGE' },
    ],
    links: new Set(['r1:p1', 'r6:p2']),
    userRoles: [
      { userId: 'u1', roleId: 'r1', active: true },
      { userId: 'u5', roleId: 'r6', active: true },
    ],
    overrides: [],
    users: { u1: { active: true }, u5: { active: true }, u9: { active: true } },
    audit: [],
  };
}

function mockPrisma(s: Store) {
  const permByCode = (code: string) => s.perms.find(p => p.code === code) ?? null;
  const roleByCode = (code: string) => s.roles.find(r => r.code === code) ?? null;
  return {
    role: {
      findUnique: vi.fn(async ({ where }: any) => {
        const r = roleByCode(where.code);
        if (!r) return null;
        return {
          ...r,
          rolePermissions: [...s.links]
            .filter(k => k.startsWith(r.id + ':'))
            .map(k => ({ permission: { code: s.perms.find(p => p.id === k.split(':')[1])!.code, description: null } })),
          userRoles: s.userRoles.filter(u => u.roleId === r.id && u.active).map(u => ({
            user: { displayName: u.userId, username: u.userId, active: s.users[u.userId]?.active ?? true },
            company: { code: 'EMP-A', name: 'E' },
            department: null,
          })),
        };
      }),
      findMany: vi.fn(async () => s.roles.map(r => ({
        ...r,
        rolePermissions: [...s.links]
          .filter(k => k.startsWith(r.id + ':'))
          .map(k => ({ permission: { code: s.perms.find(p => p.id === k.split(':')[1])!.code } })),
        userRoles: s.userRoles.filter(u => u.roleId === r.id && u.active).map(u => ({ userId: u.userId })),
      }))),
    },
    permission: {
      findUnique: vi.fn(async ({ where }: any) => permByCode(where.code)),
      findMany: vi.fn(async () => s.perms.map(p => ({ code: p.code, description: null }))),
    },
    rolePermission: {
      findUnique: vi.fn(async ({ where }: any) =>
        s.links.has(`${where.roleId_permissionId.roleId}:${where.roleId_permissionId.permissionId}`)
          ? { roleId: where.roleId_permissionId.roleId, permissionId: where.roleId_permissionId.permissionId }
          : null,
      ),
      create: vi.fn(async ({ data }: any) => { s.links.add(`${data.roleId}:${data.permissionId}`); return data; }),
      delete: vi.fn(async ({ where }: any) => { s.links.delete(`${where.roleId_permissionId.roleId}:${where.roleId_permissionId.permissionId}`); return {}; }),
    },
    userRole: {
      findMany: vi.fn(async ({ where }: any = {}) => {
        // Soporta findMany de assertAdminSurvives y de getEffectivePermissions.
        let rows = s.userRoles.filter(u => (where.active === undefined || u.active === where.active));
        if (where.roleId && typeof where.roleId === 'string') rows = rows.filter(u => u.roleId === where.roleId);
        if (where.roleId?.not) rows = rows.filter(u => u.roleId !== where.roleId.not);
        if (where.userId) rows = rows.filter(u => u.userId === where.userId);
        if (where.role?.rolePermissions?.some) {
          const code = where.role.rolePermissions.some.permission.code;
          const perm = permByCode(code);
          rows = rows.filter(u => perm && s.links.has(`${u.roleId}:${perm.id}`));
        }
        if (where.user) rows = rows.filter(u => s.users[u.userId]?.active);
        return rows.map(u => {
          const role = s.roles.find(r => r.id === u.roleId)!;
          return {
            ...u,
            role: {
              code: role.code,
              rolePermissions: [...s.links]
                .filter(k => k.startsWith(role.id + ':'))
                .map(k => ({ permission: { code: s.perms.find(p => p.id === k.split(':')[1])!.code } })),
            },
          };
        });
      }),
    },
    userPermissionOverride: {
      findMany: vi.fn(async ({ where }: any = {}) => {
        let rows = s.overrides;
        if (where.userId) rows = rows.filter(o => o.userId === where.userId);
        if (where.effect) rows = rows.filter(o => o.effect === where.effect);
        if (where.permission?.code) {
          const perm = permByCode(where.permission.code);
          rows = rows.filter(o => perm && o.permissionId === perm.id);
        }
        if (where.user) rows = rows.filter(o => s.users[o.userId]?.active);
        return rows.map(o => ({
          ...o,
          permission: { code: s.perms.find(p => p.id === o.permissionId)!.code },
        }));
      }),
    },
    userPermissionOverride: {
      findMany: vi.fn(async () => s.overrides.map(o => ({
        ...o,
        permission: { code: s.perms.find(p => p.id === o.permissionId)!.code },
      }))),
    },
  } as any;
}

const auditoria = (s: Store) => ({ logEvent: vi.fn(async (e: any) => { s.audit.push(e.action); return {}; }) }) as any;
const svc = (s: Store) => new RolesService(mockPrisma(s), auditoria(s));

function guardCtxFor(controller: any, method: string, permissions: string[] | null, user: any): any {
  return {
    switchToHttp: () => ({ getRequest: () => (user ? { user } : {}) }),
    getHandler: () => (controller as any).prototype[method],
    getClass: () => controller,
  };
}

describe('10I — administración de roles', () => {
  it('1. GET roles sin sesión → 401', () => {
    const guard = new RbacGuard(new Reflector());
    expect(() => guard.canActivate(guardCtxFor(RolesController, 'listar', null, null))).toThrow(/Sesión requerida/);
  });

  it('2. GET roles sin ADMIN.MANAGE → 403', () => {
    const guard = new RbacGuard(new Reflector());
    const ctx = guardCtxFor(RolesController, 'listar', null, { id: 'u1', permissions: ['REQUEST.VIEW'] });
    expect(() => guard.canActivate(ctx)).toThrow(/ADMIN.MANAGE/);
  });

  it('3. GET roles con ADMIN.MANAGE → 200 (lista real)', async () => {
    const s = seedStore();
    const guard = new RbacGuard(new Reflector());
    const ctx = guardCtxFor(RolesController, 'listar', null, { id: 'u5', permissions: ['ADMIN.MANAGE'] });
    expect(guard.canActivate(ctx)).toBe(true);
    const ctrl = new RolesController(svc(s));
    const rows: any[] = await ctrl.listar();
    expect(rows.find(r => r.code === 'MASTER_DATA_ADMIN')?.permissionCount).toBe(1);
    expect(rows.find(r => r.code === 'REQUESTER')?.userCount).toBe(1);
  });

  it('4. obtener permisos de rol', async () => {
    const s = seedStore();
    const d: any = await svc(s).getRole('REQUESTER');
    expect(d.permissions.map((p: any) => p.code)).toEqual(['REQUEST.VIEW']);
    expect(d.users[0].username).toBeDefined();
  });

  it('5. asignar permiso existente', async () => {
    const s = seedStore();
    s.perms.push({ id: 'p3', code: 'REQUEST.CREATE' });
    const res: any = await svc(s).grantPermission('REQUESTER', 'REQUEST.CREATE', 'u5');
    expect(res).toEqual({ ok: true, created: true });
    expect(s.links.has('r1:p3')).toBe(true);
  });

  it('6. no duplicar RolePermission', async () => {
    const s = seedStore();
    const service = svc(s);
    const before = s.links.size;
    const res: any = await service.grantPermission('REQUESTER', 'REQUEST.VIEW', 'u5');
    expect(res).toEqual({ ok: true, created: false });
    expect(s.links.size).toBe(before);
  });

  it('7. quitar permiso', async () => {
    const s = seedStore();
    const res: any = await svc(s).removePermission('REQUESTER', 'REQUEST.VIEW', 'u5');
    expect(res).toEqual({ ok: true, removed: true });
    expect(s.links.has('r1:p1')).toBe(false);
  });

  it('8. quitar permiso inexistente de forma segura', async () => {
    const s = seedStore();
    const res: any = await svc(s).removePermission('REQUESTER', 'ADMIN.MANAGE', 'u5');
    expect(res).toEqual({ ok: true, removed: false });
  });

  it('9. cambio de permiso queda persistido', async () => {
    const s = seedStore();
    s.perms.push({ id: 'p3', code: 'REQUEST.CREATE' });
    const service = svc(s);
    await service.grantPermission('REQUESTER', 'REQUEST.CREATE', 'u5');
    const d: any = await service.getRole('REQUESTER');
    expect(d.permissions.map((p: any) => p.code)).toContain('REQUEST.CREATE');
  });

  it('10. cambio de rol afecta permisos heredados', async () => {
    const s = seedStore();
    s.perms.push({ id: 'p3', code: 'REQUEST.CREATE' });
    const roles = svc(s);
    const auth = new AutenticacionService(mockPrisma(s));
    const before = await auth.getEffectivePermissions('u1');
    expect(before.permissions).not.toContain('REQUEST.CREATE');
    await roles.grantPermission('REQUESTER', 'REQUEST.CREATE', 'u5');
    const after = await auth.getEffectivePermissions('u1');
    expect(after.permissions).toContain('REQUEST.CREATE');
  });

  it('11. override +CONCEDIDO continúa funcionando tras cambio de rol', async () => {
    const s = seedStore();
    s.overrides.push({ userId: 'u1', permissionId: 'p2', effect: 'GRANT' });
    const auth = new AutenticacionService(mockPrisma(s));
    const eff = await auth.getEffectivePermissions('u1');
    expect(eff.permissions).toContain('ADMIN.MANAGE');
  });

  it('12. override −DENEGADO continúa denegando tras cambio de rol', async () => {
    const s = seedStore();
    s.overrides.push({ userId: 'u1', permissionId: 'p1', effect: 'DENY' });
    const auth = new AutenticacionService(mockPrisma(s));
    const eff = await auth.getEffectivePermissions('u1');
    expect(eff.permissions).not.toContain('REQUEST.VIEW');
  });

  it('13. no permitir eliminar ADMIN.MANAGE si deja al sistema sin administrador', async () => {
    const s = seedStore();
    await expect(svc(s).removePermission('MASTER_DATA_ADMIN', 'ADMIN.MANAGE', 'u5')).rejects.toThrow(/sin ningún administrador/);
    // Con otro titular (override CONCEDIDO a u9), sí se permite.
    s.overrides.push({ userId: 'u9', permissionId: 'p2', effect: 'GRANT' });
    const res: any = await svc(s).removePermission('MASTER_DATA_ADMIN', 'ADMIN.MANAGE', 'u5');
    expect(res.removed).toBe(true);
  });

  it('14/15. auditar ROLE_PERMISSION_GRANTED y ROLE_PERMISSION_REMOVED', async () => {
    const s = seedStore();
    s.perms.push({ id: 'p3', code: 'REQUEST.CREATE' });
    const aud = auditoria(s);
    const service = new RolesService(mockPrisma(s), aud);
    await service.grantPermission('REQUESTER', 'REQUEST.CREATE', 'u5');
    await service.removePermission('REQUESTER', 'REQUEST.CREATE', 'u5');
    const actions = aud.logEvent.mock.calls.map((c: any) => c[0].action);
    expect(actions).toContain('ROLE_PERMISSION_GRANTED');
    expect(actions).toContain('ROLE_PERMISSION_REMOVED');
    const granted = aud.logEvent.mock.calls.find((c: any) => c[0].action === 'ROLE_PERMISSION_GRANTED')[0];
    expect(granted.roleCode ?? JSON.parse(granted.afterData).roleCode).toBeDefined();
  });
});
