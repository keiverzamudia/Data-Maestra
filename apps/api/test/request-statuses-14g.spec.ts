import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';

/** 14G — filtro multi-estado server-side para bandejas (AND con el scope). */
function makeService() {
  const prisma: any = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'admin', active: true }) },
    department: { findMany: vi.fn().mockResolvedValue([]) },
    request: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    auditEvent: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const auth: any = {
    getMemberships: vi.fn().mockResolvedValue([{ companyId: 'c1' }]),
    getEffectivePermissions: vi.fn().mockResolvedValue({ permissions: ['ADMIN.MANAGE'] }),
  };
  const service = new SolicitudesService(prisma, {} as any, {} as any, {} as any, auth);
  return { service, prisma };
}

describe('findScoped statuses (14G)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('filtra por varios estados con AND sobre el scope', async () => {
    const { service, prisma } = makeService();
    await service.findScoped('admin', {
      scope: 'activas',
      statuses: ['CONTABILIDAD_APROBADA', 'PROCESANDO_PROFIT', 'INSERTADO_PROFIT', 'ERROR_PROFIT'],
    });
    const where = prisma.request.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      AND: [{}, { status: { in: ['CONTABILIDAD_APROBADA', 'PROCESANDO_PROFIT', 'INSERTADO_PROFIT', 'ERROR_PROFIT'] } }],
    });
  });

  it('descarta estados fuera de la whitelist', async () => {
    const { service, prisma } = makeService();
    await service.findScoped('admin', { scope: 'activas', statuses: ['CONTABILIDAD_APROBADA', 'INVENTADO', ''] });
    const where = prisma.request.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ AND: [{}, { status: { in: ['CONTABILIDAD_APROBADA'] } }] });
  });

  it('statuses prevalece sobre status singular', async () => {
    const { service, prisma } = makeService();
    await service.findScoped('admin', { scope: 'activas', status: 'BORRADOR', statuses: ['CONTABILIDAD_APROBADA'] });
    const where = prisma.request.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ AND: [{}, { status: { in: ['CONTABILIDAD_APROBADA'] } }] });
  });

  it('sin statuses conserva el comportamiento anterior', async () => {
    const { service, prisma } = makeService();
    await service.findScoped('admin', { scope: 'activas', status: 'BORRADOR' });
    const where = prisma.request.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ AND: [{}, { status: 'BORRADOR' }] });
  });
});
