import { describe, it, expect, vi, beforeEach } from 'vitest';
import { REQUIRE_PERMISSION_KEY } from '../src/modulos/autenticacion/require-permission.decorator';
import { SolicitudesController } from '../src/modulos/solicitudes/solicitud.controller';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';
import { RolesService } from '../src/modulos/roles/roles.service';
import {
  ROLE_VIEWS,
  isRoleViewKey,
  resolveDefaultView,
} from '../src/modulos/roles/role-default-view';

// ---------------------------------------------------------------------------
// FASE 18 — RBAC Profit, Mis solicitudes por propietario y vista por rol.
// Cero escrituras reales en Profit (mocks). Flag intacto.
// ---------------------------------------------------------------------------

function makeRequestsService() {
  const prisma: any = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', active: true }) },
    department: { findMany: vi.fn().mockResolvedValue([]) },
    request: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    auditEvent: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const auth: any = {
    getMemberships: vi.fn().mockResolvedValue([{ companyId: 'c1' }]),
    getEffectivePermissions: vi.fn().mockResolvedValue({ permissions: ['REQUEST.VIEW'] }),
  };
  return { service: new SolicitudesService(prisma, {} as any, {} as any, {} as any, auth), prisma };
}

describe('FASE 18 — autorización Profit en backend', () => {
  it('Caso 4: preparar exige PROFIT.WRITE (propietario sin permiso → 403)', () => {
    const perms: string[] = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, SolicitudesController.prototype.profitPlan) ?? [];
    expect(perms).toEqual(['PROFIT.WRITE']);
  });

  it('registrar/verificar/reintentar exigen PROFIT.WRITE', () => {
    for (const m of ['profitCreate', 'profitVerify', 'profitRetry'] as const) {
      const perms: string[] = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, SolicitudesController.prototype[m]) ?? [];
      expect(perms).toContain('PROFIT.WRITE');
    }
  });

  it('corporate homologate/register-article exigen PROFIT.WRITE', async () => {
    const mod = await import('../src/modulos/profit/corporate.controller');
    for (const m of ['homologate', 'registerArticle'] as const) {
      const perms: string[] = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, mod.CorporateController.prototype[m]) ?? [];
      expect(perms).toContain('PROFIT.WRITE');
    }
  });
});

describe('FASE 18 — Mis solicitudes por propietario', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('Caso 1/2: mine=true incluye estados terminales propios (sin filtro notIn)', async () => {
    const { service, prisma } = makeRequestsService();
    await service.findScoped('u1', { scope: 'activas', mine: true });
    const where = prisma.request.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"requesterId":"u1"');
    expect(JSON.stringify(where)).not.toContain('notIn');
  });

  it('Caso 2: buckets siguen particionando (completadas conserva su filtro)', async () => {
    const { service, prisma } = makeRequestsService();
    await service.findScoped('u1', { mine: true, bucket: 'completadas' });
    const where = prisma.request.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"requesterId":"u1"');
    expect(JSON.stringify(where)).toContain('INSERTADO_PROFIT');
  });

  it('sin mine, el scope operativo no cambia (bandejas por rol/estado)', async () => {
    const { service, prisma } = makeRequestsService();
    await service.findScoped('u1', { scope: 'activas' });
    const where = prisma.request.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('notIn');
  });
});

describe('FASE 18 — vista principal por rol (puro)', () => {
  it('Caso 7: sin configuración → Mis solicitudes', () => {
    expect(resolveDefaultView([], () => false)).toEqual(ROLE_VIEWS['solicitudes']);
    expect(resolveDefaultView([{ roleCode: 'REQUESTER', defaultView: null }], () => true).key).toBe('solicitudes');
  });

  it('Caso 8: rol configurado con permiso → su vista', () => {
    const v = resolveDefaultView(
      [{ roleCode: 'ACCOUNTING', defaultView: 'accounting' }],
      (p) => p === 'ACCOUNTING.VIEW',
    );
    expect(v.route).toBe('/accounting');
  });

  it('Caso 9: vista configurada sin permiso → fallback seguro', () => {
    const v = resolveDefaultView(
      [{ roleCode: 'ACCOUNTING', defaultView: 'accounting' }],
      () => false,
    );
    expect(v).toEqual(ROLE_VIEWS['solicitudes']);
  });

  it('vista inválida se ignora; determinación por código de rol', () => {
    const v = resolveDefaultView(
      [
        { roleCode: 'WAREHOUSE', defaultView: 'warehouse' },
        { roleCode: 'ACCOUNTING', defaultView: 'no-existe' as never },
      ],
      (p) => p === 'WAREHOUSE.VIEW',
    );
    expect(v.key).toBe('warehouse');
  });

  it('isRoleViewKey solo acepta el whitelist', () => {
    expect(isRoleViewKey('solicitudes')).toBe(true);
    expect(isRoleViewKey('/solicitudes')).toBe(false);
    expect(isRoleViewKey('admin')).toBe(false);
    expect(isRoleViewKey(null)).toBe(false);
  });
});

describe('FASE 18 — RolesService.setDefaultView/myDefaultView', () => {
  function makeRolesService(over: Record<string, any> = {}) {
    const prisma: any = {
      role: {
        findUnique: vi.fn().mockResolvedValue({ id: 'r4', code: 'ACCOUNTING' }),
        update: vi.fn().mockResolvedValue({}),
      },
      userRole: { findMany: vi.fn().mockResolvedValue([]) },
      ...over,
    };
    const auditoria: any = { logEvent: vi.fn().mockResolvedValue({}) };
    const auth: any = { getEffectivePermissions: vi.fn().mockResolvedValue({ permissions: [] }) };
    return { svc: new RolesService(prisma, auditoria, auth), prisma, auditoria, auth };
  }

  it('Caso 10: cambio de vista persiste y audita', async () => {
    const { svc, prisma, auditoria } = makeRolesService();
    const r = await svc.setDefaultView('ACCOUNTING', 'accounting', 'u5');
    expect(r).toEqual({ ok: true, roleCode: 'ACCOUNTING', defaultView: 'accounting' });
    expect(prisma.role.update).toHaveBeenCalledWith({ where: { id: 'r4' }, data: { defaultView: 'accounting' } });
    expect(auditoria.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'ROLE_DEFAULT_VIEW_CHANGED' }));
  });

  it('vista fuera del whitelist se rechaza sin escribir', async () => {
    const { svc, prisma } = makeRolesService();
    await expect(svc.setDefaultView('ACCOUNTING', 'profit', 'u5')).rejects.toThrow();
    expect(prisma.role.update).not.toHaveBeenCalled();
  });

  it('limpiar vista (null) restaura fallback', async () => {
    const { svc, prisma } = makeRolesService();
    const r = await svc.setDefaultView('ACCOUNTING', null, 'u5');
    expect(r.defaultView).toBeNull();
    expect(prisma.role.update).toHaveBeenCalledWith({ where: { id: 'r4' }, data: { defaultView: null } });
  });

  it('mi vista resuelve con permisos efectivos del usuario', async () => {
    const { svc, auth } = makeRolesService({
      userRole: {
        findMany: vi.fn().mockResolvedValue([
          { role: { code: 'ACCOUNTING', defaultView: 'accounting' } },
        ]),
      },
    });
    auth.getEffectivePermissions.mockResolvedValue({ permissions: ['REQUEST.VIEW', 'ACCOUNTING.VIEW'] });
    expect((await svc.myDefaultView('u4')).route).toBe('/accounting');
    auth.getEffectivePermissions.mockResolvedValue({ permissions: ['REQUEST.VIEW'] });
    expect((await svc.myDefaultView('u4')).route).toBe('/solicitudes');
  });
});
