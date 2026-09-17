import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';

// ---------------------------------------------------------------------------
// FASE 21 — Alcance personal y buckets exhaustivos. Mocks, sin Profit real.
// ---------------------------------------------------------------------------

function makeService() {
  const prisma: any = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'u9', active: true }) },
    department: { findMany: vi.fn().mockResolvedValue([]) },
    request: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockImplementation((args: any) => Promise.resolve(
        JSON.stringify(args?.where ?? {}).includes('"requesterId":"u9"') ? 1 : 61,
      )),
    },
    auditEvent: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const auth: any = {
    getMemberships: vi.fn().mockResolvedValue([{ companyId: 'c1' }]),
    getEffectivePermissions: vi.fn().mockResolvedValue({ permissions: ['REQUEST.VIEW'] }),
  };
  return { service: new SolicitudesService(prisma, {} as any, {} as any, {} as any, auth), prisma };
}

describe('FASE 21 — base personal en mine=true', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('CASO A: Total cuenta solo lo propio (base = propietario)', async () => {
    const { service, prisma } = makeService();
    const r = await service.findScoped('u9', { mine: true });
    expect(r.total).toBe(1);
    expect(r.items).toEqual([]);
    const totalWhere = prisma.request.count.mock.calls[0][0].where;
    expect(totalWhere).toEqual({ requesterId: 'u9' });
  });

  it('la tabla usa el mismo universo (AND sobre la base propia)', async () => {
    const { service, prisma } = makeService();
    await service.findScoped('u9', { mine: true });
    const where = prisma.request.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({ requesterId: 'u9' });
    expect(JSON.stringify(where)).toContain('"requesterId":"u9"');
  });
});

describe('FASE 21 — buckets mutuamente excluyentes y exhaustivos', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('CASO B: proceso + completadas + rechazadas particionan sin solaparse', async () => {
    const { service, prisma } = makeService();
    await service.findScoped('u9', { mine: true, bucket: 'proceso' });
    await service.findScoped('u9', { mine: true, bucket: 'completadas' });
    await service.findScoped('u9', { mine: true, bucket: 'rechazadas' });
    const wheres = prisma.request.findMany.mock.calls.map((c: any[]) => c[0].where);
    const s = wheres.map((w: unknown) => JSON.stringify(w));
    // proceso excluye terminales; completadas y rechazadas son conjuntos fijos.
    expect(s[0]).toContain('notIn');
    expect(s[0]).toContain('INSERTADO_PROFIT');
    expect(s[1]).toContain('CONTABILIDAD_APROBADA');
    expect(s[2]).toContain('RECHAZADO');
    // Ningún bucket incluye estados de otro.
    expect(s[1]).not.toContain('RECHAZADO');
    expect(s[2]).not.toContain('INSERTADO_PROFIT');
    // Los tres comparten la misma base propia.
    for (const w of wheres) {
      expect(JSON.stringify(w)).toContain('"requesterId":"u9"');
    }
  });
});

describe('FASE 21 — modo global autorizado (findGlobal)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('CASO C/E: global usa base de ámbito y personal usa base propia (sin mezcla)', async () => {
    const { service, prisma } = makeService();
    await service.findGlobal('u9', {});
    const globalWhere = prisma.request.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(globalWhere)).toContain('"companyId":{"in":["c1"]}');
    expect(JSON.stringify(globalWhere)).not.toContain('"requesterId"');
    await service.findScoped('u9', { mine: true });
    const personalWhere = prisma.request.findMany.mock.calls[1][0].where;
    expect(JSON.stringify(personalWhere)).toContain('"requesterId":"u9"');
  });
});
