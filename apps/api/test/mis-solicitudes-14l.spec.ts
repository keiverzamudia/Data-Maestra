import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';

/** 14L — Mis solicitudes: filtro propio server-side, búsqueda y orden. */
function makeService() {
  const prisma: any = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', active: true }) },
    department: { findMany: vi.fn().mockResolvedValue([]) },
    request: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    requestData: { findUnique: vi.fn(), update: vi.fn() },
    requestArticleLink: { findUnique: vi.fn().mockResolvedValue(null) },
    auditEvent: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    catalogGroup: { findUnique: vi.fn() },
    catalogSubgroup: { findFirst: vi.fn(), findUnique: vi.fn() },
    catalogCategory: { findFirst: vi.fn(), findUnique: vi.fn() },
  };
  const auth: any = {
    getMemberships: vi.fn().mockResolvedValue([{ companyId: 'c1' }]),
    getEffectivePermissions: vi.fn().mockResolvedValue({ permissions: ['REQUEST.VIEW'] }),
  };
  const service = new SolicitudesService(prisma, {} as any, {} as any, {} as any, auth);
  return { service, prisma };
}

describe('findScoped mine/sort/search (14L)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('mine=true fuerza requesterId a la sesión aunque se intente suplantar', async () => {
    const { service, prisma } = makeService();
    await service.findScoped('u1', { scope: 'activas', mine: true, requesterId: 'otro-usuario' });
    const where = prisma.request.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"requesterId":"u1"');
    expect(JSON.stringify(where)).not.toContain('otro-usuario');
  });

  it('mine=true también rige para admin', async () => {
    const { service, prisma } = makeService();
    await service.findScoped('admin', { scope: 'historial', mine: true });
    const where = prisma.request.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"requesterId":"admin"');
  });

  it('search alcanza masterCode, partNumber y profitCode', async () => {
    const { service, prisma } = makeService();
    await service.findScoped('u1', { scope: 'activas', search: 'FERMIS' });
    const or = prisma.request.findMany.mock.calls[0][0].where.AND[1].OR;
    expect(or).toContainEqual({ requestData: { masterCode: { contains: 'FERMIS' } } });
    expect(or).toContainEqual({ requestData: { partNumber: { contains: 'FERMIS' } } });
    expect(or).toContainEqual({ requestData: { profitCode: { contains: 'FERMIS' } } });
  });

  it('sort mapea a orderBy whitelist', async () => {
    const { service, prisma } = makeService();
    await service.findScoped('u1', { scope: 'activas', sort: 'antiguas' });
    expect(prisma.request.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' });
    await service.findScoped('u1', { scope: 'activas', sort: 'actualizadas' });
    expect(prisma.request.findMany.mock.calls[1][0].orderBy).toEqual({ updatedAt: 'desc' });
    await service.findScoped('u1', { scope: 'activas', sort: 'invalido' });
    expect(prisma.request.findMany.mock.calls[2][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('createInProfit guarda profitCode en la solicitud', async () => {
    const { service, prisma } = makeService();
    prisma.request.findUnique.mockResolvedValue({
      id: 'req-1', status: 'CONTABILIDAD_APROBADA', requestNumber: 'REQ-1',
      requestedDescription: 'X',
      requestData: { groupId: 'g1', subgroupId: 's1', articleType: 'C', taxType: '1', unitCode: 'UND' },
    });
    prisma.catalogGroup.findUnique.mockResolvedValue({ id: 'g1', code: 'ACT' });
    prisma.catalogSubgroup.findUnique.mockResolvedValue({ id: 's1', code: 'EQT' });
    prisma.request.updateMany.mockResolvedValue({ count: 1 });
    const engine: any = {
      assertAvailable: vi.fn(),
      allocateAndInsert: vi.fn().mockResolvedValue({
        ok: true, coArt: 'ACTEQT0001', attempts: [], reconcile: 'CREATED_AND_VERIFIED', differences: [],
      }),
    };
    const svc = new SolicitudesService(prisma, {} as any, {} as any, {} as any, {} as any, engine);
    const r = await svc.createInProfit('req-1', 'u1', 'c1');
    expect(r.ok).toBe(true);
    expect(prisma.requestData.update).toHaveBeenCalledWith({
      where: { requestId: 'req-1' },
      data: { profitCode: 'ACTEQT0001' },
    });
  });
});
