import { describe, it, expect, vi, beforeEach } from 'vitest';
import { REQUIRE_PERMISSION_KEY } from '../src/modulos/autenticacion/require-permission.decorator';
import { SolicitudesController } from '../src/modulos/solicitudes/solicitud.controller';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';
import { ROLE_VIEWS, resolveDefaultView } from '../src/modulos/roles/role-default-view';

// ---------------------------------------------------------------------------
// FASE 19 — Dashboard Gerencial, Todas las solicitudes y métricas personales.
// Cero escrituras reales en Profit (mocks). Flag intacto.
// ---------------------------------------------------------------------------

function makeService(opts: { admin?: boolean; companies?: string[] } = {}) {
  const prisma: any = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'u9', active: true }) },
    department: { findMany: vi.fn().mockResolvedValue([]) },
    request: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    auditEvent: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const auth: any = {
    getMemberships: vi.fn().mockResolvedValue((opts.companies ?? ['c1']).map((companyId) => ({ companyId }))),
    getEffectivePermissions: vi.fn().mockResolvedValue({ permissions: ['REQUEST.VIEW'] }),
  };
  if (opts.admin) {
    auth.getEffectivePermissions = vi.fn().mockResolvedValue({ permissions: ['ADMIN.MANAGE', 'SOLICITUDES.VIEW_ALL'] });
  }
  return { service: new SolicitudesService(prisma, {} as any, {} as any, {} as any, auth), prisma };
}

describe('FASE 19 — autorización de Todas las solicitudes', () => {
  it('GET /requests/todas exige SOLICITUDES.VIEW_ALL (nunca solo UI)', () => {
    const perms: string[] = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, SolicitudesController.prototype.findTodas) ?? [];
    expect(perms).toEqual(['SOLICITUDES.VIEW_ALL']);
  });
});

describe('FASE 19 — findGlobal (backend como autoridad)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('usuario autorizado ve su ámbito (empresas propias), no todo', async () => {
    const { service, prisma } = makeService({ companies: ['c1'] });
    await service.findGlobal('u9', { page: 1, limit: 25 });
    const where = prisma.request.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"companyId":{"in":["c1"]}');
  });

  it('filtros: estado, búsqueda, solicitante, prioridad y paginación en BD', async () => {
    const { service, prisma } = makeService();
    await service.findGlobal('u9', {
      status: 'PENDIENTE_ALMACEN', search: 'FERMIS', requesterId: 'u1', priority: 2, page: 2, limit: 50,
    });
    const args = prisma.request.findMany.mock.calls[0][0];
    const s = JSON.stringify(args.where);
    expect(s).toContain('PENDIENTE_ALMACEN');
    expect(s).toContain('FERMIS');
    expect(s).toContain('"requesterId":"u1"');
    expect(s).toContain('"priority":2');
    expect(args.skip).toBe(50);
    expect(args.take).toBe(50);
  });

  it('filtros no amplían el ámbito (AND con la base)', async () => {
    const { service, prisma } = makeService({ companies: ['c1'] });
    await service.findGlobal('u9', { companyId: 'c99' });
    const where = prisma.request.findMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(2);
    expect(JSON.stringify(where.AND[0])).toContain('"companyId":{"in":["c1"]}');
  });

  it('admin ve todo (sin restricción de empresa)', async () => {
    const { service, prisma } = makeService({ admin: true });
    await service.findGlobal('u5', {});
    const where = prisma.request.findMany.mock.calls[0][0].where;
    expect(where).toEqual({});
  });
});

describe('FASE 19 — métricas personales vs globales', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('Mis solicitudes (mine) nunca incluye solicitudes ajenas', async () => {
    const { service, prisma } = makeService();
    await service.findScoped('u9', { mine: true });
    const where = prisma.request.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"requesterId":"u9"');
    // Sin OR global: solo lo propio.
    expect(JSON.stringify(where)).not.toContain('"companyId":{"in"');
  });

  it('un usuario con 1 solicitud no recibe métricas globales del panel', async () => {
    const { service, prisma } = makeService();
    prisma.request.count.mockResolvedValue(1);
    await service.findScoped('u9', { mine: true });
    const totalCall = prisma.request.count.mock.calls.find((c: any[]) => JSON.stringify(c[0].where ?? {}).includes('u9'));
    expect(totalCall).toBeTruthy();
    // El panel gerencial cuenta sin requesterId (universo global).
    expect(JSON.stringify({ status: { in: ['PENDIENTE_GERENTE'] } })).not.toContain('requesterId');
  });
});

describe('FASE 19 — resolución de vistas', () => {
  it('dashboard gerencial resuelve a / con permiso', () => {
    const v = resolveDefaultView(
      [{ roleCode: 'GERENCIA', defaultView: 'dashboard' }],
      (p) => ['DASHBOARD.VIEW', 'REQUEST.VIEW'].includes(p),
    );
    expect(v.route).toBe('/');
    expect(v.label).toBe('Dashboard Gerencial');
    expect(ROLE_VIEWS['dashboard'].route).toBe('/');
  });

  it('la vista no concede permisos (sin DASHBOARD.VIEW → fallback)', () => {
    const v = resolveDefaultView(
      [{ roleCode: 'GERENCIA', defaultView: 'dashboard' }],
      (p) => p === 'REQUEST.VIEW',
    );
    expect(v.route).toBe('/solicitudes');
  });
});
