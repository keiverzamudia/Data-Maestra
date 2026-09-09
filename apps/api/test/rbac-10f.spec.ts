import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../src/modulos/autenticacion/rbac.guard';
import { AutenticacionService } from '../src/modulos/autenticacion/autenticacion.service';
import { UsuariosController } from '../src/modulos/usuarios/usuarios.controller';

function mockPrisma(rows: any[]) {
  return {
    userRole: { findMany: vi.fn(async () => rows) },
    userPermissionOverride: { findMany: vi.fn(async () => []) },
  } as any;
}

function roleRow(code: string, perms: string[]) {
  return {
    role: { code, rolePermissions: perms.map(p => ({ permission: { code: p } })) },
  };
}

function guardCtx(req: any): any {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
}

describe('FASE 10F — RBAC real (BD)', () => {
  it('1. usuario sin sesión → 401', () => {
    const guard = new RbacGuard({ getAllAndOverride: () => ['ADMIN.MANAGE'] } as any);
    expect(() => guard.canActivate(guardCtx({}))).toThrow(/Sesión requerida/);
    expect(() => guard.canActivate(guardCtx({ user: {} }))).toThrow(/Sesión requerida/);
  });

  it('2. autenticado sin permiso → 403 con el permiso requerido', () => {
    const guard = new RbacGuard({ getAllAndOverride: () => ['ADMIN.MANAGE'] } as any);
    const req = { user: { id: 'u1', permissions: ['REQUEST.VIEW'] } };
    expect(() => guard.canActivate(guardCtx(req))).toThrow(/ADMIN.MANAGE/);
  });

  it('3. usuario con permiso por rol → permitido', () => {
    const guard = new RbacGuard({ getAllAndOverride: () => ['REQUEST.CREATE'] } as any);
    const req = { user: { id: 'u1', permissions: ['REQUEST.CREATE', 'REQUEST.VIEW'] } };
    expect(guard.canActivate(guardCtx(req))).toBe(true);
  });

  it('4. MASTER_DATA_ADMIN resuelve ADMIN.MANAGE desde BD', async () => {
    const svc = new AutenticacionService(
      mockPrisma([
        roleRow('MASTER_DATA_ADMIN', ['ADMIN.MANAGE', 'DASHBOARD.VIEW', 'AUDIT.VIEW', 'IMPORT.RUN', 'IMPORT.VIEW']),
      ]),
    );
    const eff = await svc.getEffectivePermissions('u5');
    expect(eff.roleCodes).toEqual(['MASTER_DATA_ADMIN']);
    expect(eff.permissions).toContain('ADMIN.MANAGE');
    expect(eff.permissions).toContain('AUDIT.VIEW');
  });

  it('5. REQUESTER no recibe ADMIN.MANAGE desde BD', async () => {
    const svc = new AutenticacionService(
      mockPrisma([roleRow('REQUESTER', ['REQUEST.CREATE', 'REQUEST.VIEW', 'DASHBOARD.VIEW'])]),
    );
    const eff = await svc.getEffectivePermissions('u1');
    expect(eff.permissions).toContain('REQUEST.CREATE');
    expect(eff.permissions).not.toContain('ADMIN.MANAGE');
  });

  it('6. sincronización:-metadata exige ADMIN.MANAGE; REQUESTER→403, admin→permitido', () => {
    const reflector = new Reflector();
    const read = (method: string): string[] =>
      reflector.getAllAndOverride<string[]>( 'require_permission', [
        UsuariosController.prototype[method],
        UsuariosController,
      ]) ?? [];
    // Sin sesión → 401 aunque el permiso exista en metadata.
    const guard = new RbacGuard(reflector);
    const noSessionCtx: any = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
      getHandler: () => UsuariosController.prototype['sincronizarProfit'],
      getClass: () => UsuariosController,
    };
    expect(read('buscar')).toContain('ADMIN.MANAGE');
    expect(read('sincronizarProfit')).toContain('ADMIN.MANAGE');
    expect(() => guard.canActivate(noSessionCtx)).toThrow(/Sesión requerida/);
    const reqCtx = (permissions: string[]): any => ({
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u-x', permissions } }) }),
      getHandler: () => UsuariosController.prototype['sincronizarProfit'],
      getClass: () => UsuariosController,
    });
    expect(() => guard.canActivate(reqCtx(['REQUEST.VIEW']))).toThrow(/ADMIN.MANAGE/);
    expect(
      guard.canActivate(reqCtx(['ADMIN.MANAGE', 'DASHBOARD.VIEW'])),
    ).toBe(true);
  });
});
