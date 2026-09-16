import { describe, it, expect, vi, beforeEach } from 'vitest';
import { REQUIRE_PERMISSION_KEY } from '../src/modulos/autenticacion/require-permission.decorator';
import { SolicitudesController } from '../src/modulos/solicitudes/solicitud.controller';
import { PanelController } from '../src/modulos/panel/panel.controller';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';
import { resolveEffectivePermissions } from '../src/comun/utilidades/permisos-efectivos';
import { resolveDefaultView } from '../src/modulos/roles/role-default-view';

// ---------------------------------------------------------------------------
// FASE 20 — DASHBOARD.VIEW y Mis solicitudes son independientes.
// Nota de códigos: "SOLICITUDES.VIEW" (funcional) = 'REQUEST.VIEW' (código
// RBAC real); "Crear solicitud" = 'REQUEST.CREATE'. No se crean permisos.
// Cero escrituras reales en Profit (mocks). Flag intacto.
// ---------------------------------------------------------------------------

function makeService() {
  const prisma: any = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', active: true }) },
    department: { findMany: vi.fn().mockResolvedValue([]) },
    request: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    auditEvent: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const auth: any = {
    getMemberships: vi.fn().mockResolvedValue([{ companyId: 'c1' }]),
    getEffectivePermissions: vi.fn().mockResolvedValue({ permissions: ['REQUEST.VIEW', 'REQUEST.CREATE'] }),
  };
  return { service: new SolicitudesService(prisma, {} as any, {} as any, {} as any, auth), prisma };
}

describe('FASE 20 — guards independientes', () => {
  it('1: /solicitudes exige REQUEST.VIEW y NO exige DASHBOARD.VIEW', () => {
    const perms: string[] = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, SolicitudesController.prototype.findAll) ?? [];
    expect(perms).toEqual(['REQUEST.VIEW']);
    expect(perms).not.toContain('DASHBOARD.VIEW');
  });

  it('3: Dashboard Gerencial exige DASHBOARD.VIEW (stats y actividad)', () => {
    for (const m of ['getStats', 'getActivity'] as const) {
      const perms: string[] = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, PanelController.prototype[m]) ?? [];
      expect(perms).toEqual(['DASHBOARD.VIEW']);
    }
  });

  it('6: SOLICITUDES.VIEW_ALL sigue independiente (código distinto, guard propio)', () => {
    expect('SOLICITUDES.VIEW_ALL').not.toBe('REQUEST.VIEW');
    const perms: string[] = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, SolicitudesController.prototype.findTodas) ?? [];
    expect(perms).toEqual(['SOLICITUDES.VIEW_ALL']);
  });
});

describe('FASE 20 — consulta personal sin DASHBOARD.VIEW', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('1-2: con solo REQUEST.VIEW consulta /solicitudes y ve únicamente lo propio', async () => {
    const { service, prisma } = makeService();
    await service.findScoped('u1', { mine: true });
    const where = prisma.request.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"requesterId":"u1"');
    expect(JSON.stringify(where)).not.toContain('DASHBOARD');
  });
});

describe('FASE 20 — quitar DASHBOARD.VIEW no arrastra otros permisos', () => {
  it('5: DENY sobre DASHBOARD.VIEW conserva REQUEST.VIEW/REQUEST.CREATE', () => {
    const r = resolveEffectivePermissions(
      ['REQUEST.VIEW', 'REQUEST.CREATE', 'DASHBOARD.VIEW'],
      [{ code: 'DASHBOARD.VIEW', effect: 'DENY' }],
    );
    expect(r.permissions).toEqual(expect.arrayContaining(['REQUEST.VIEW', 'REQUEST.CREATE']));
    expect(r.permissions).not.toContain('DASHBOARD.VIEW');
    expect(r.detail.find(d => d.code === 'REQUEST.VIEW')).toMatchObject({ granted: true });
  });
});

describe('FASE 20 — fallback personal de vista principal', () => {
  it('4: sin DASHBOARD.VIEW + con REQUEST.VIEW => /solicitudes', () => {
    const v = resolveDefaultView([], (p) => p === 'REQUEST.VIEW');
    expect(v.route).toBe('/solicitudes');
  });

  it('Caso A: con DASHBOARD.VIEW + defaultView dashboard => /', () => {
    const v = resolveDefaultView(
      [{ roleCode: 'GERENCIA', defaultView: 'dashboard' }],
      (p) => ['DASHBOARD.VIEW', 'REQUEST.VIEW'].includes(p),
    );
    expect(v.route).toBe('/');
  });

  it('Caso E: defaultView dashboard sin permiso => /solicitudes si hay REQUEST.VIEW', () => {
    const v = resolveDefaultView(
      [{ roleCode: 'X', defaultView: 'dashboard' }],
      (p) => p === 'REQUEST.VIEW',
    );
    expect(v.route).toBe('/solicitudes');
  });
});
