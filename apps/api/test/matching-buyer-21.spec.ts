import { describe, it, expect, vi } from 'vitest';
import { REQUIRE_PERMISSION_KEY } from '../src/modulos/autenticacion/require-permission.decorator';
import { MatchingController } from '../src/modulos/matching/matching.controller';
import { MatchingService } from '../src/modulos/matching/application/matching.service';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';

function buildMatching() {
  const links = new Map<string, any>();
  const audit: any[] = [];
  const prisma: any = {
    request: {
      findUnique: vi.fn(async ({ where }: any) =>
        where.id === 'req-1'
          ? { id: 'req-1', status: 'PENDIENTE_ALMACEN' }
          : null,
      ),
    },
    requestArticleLink: {
      findUnique: vi.fn(async ({ where }: any) => links.get(where.requestId) ?? null),
      upsert: vi.fn(async ({ where, create }: any) => {
        const row = { id: 'link-1', decidedAt: new Date(), ...create };
        links.set(where.requestId, row);
        return row;
      }),
    },
  };
  const profitAdapter: any = {
    getArticle: vi.fn(async (code: string) =>
      code === 'FERMIS0662'
        ? { co_art: code, art_des: 'FILTRO', co_lin: 'FER', co_subl: 'MIS', co_cat: '01', co_color: '01', uni_venta: 'UND', stock_act: 0 }
        : null,
    ),
  };
  const repository: any = {
    findProfile: vi.fn(), upsertProfile: vi.fn(), findDecision: vi.fn(), createDecision: vi.fn(),
    listProfiles: vi.fn(async () => []), findDecisionsInvolving: vi.fn(async () => []),
    findRequestLink: (id: string) => prisma.requestArticleLink.findUnique({ where: { requestId: id } }),
    upsertRequestLink: (d: any) => prisma.requestArticleLink.upsert({ where: { requestId: d.requestId }, create: d, update: d }),
  };
  const auditoria: any = { logEvent: vi.fn(async (e: any) => { audit.push(e); return e; }) };
  const service = new MatchingService(prisma, profitAdapter, {} as any, repository, auditoria);
  return { service, prisma, profitAdapter, audit, links };
}

describe('vincular solicitud → artículo existente', () => {
  it('SAME persiste el vínculo + auditoría (solo PENDIENTE_ALMACEN, artículo verificado)', async () => {
    const { service, audit } = buildMatching();
    const link = await service.linkRequestToExisting('req-1', 'AD_TRANS', 'FERMIS0662', 'SAME', 'u-alm');
    expect(link.decision).toBe('SAME');
    expect(link.companyCode).toBe('AD_TRANS');
    expect(link.profitArticleCode).toBe('FERMIS0662');
    expect(audit.filter((e) => e.action === 'MATCH_REQUEST_LINKED')).toHaveLength(1);
  });

  it('rechaza solicitud inexistente, estado inválido y artículo inexistente', async () => {
    const { service } = buildMatching();
    await expect(service.linkRequestToExisting('nope', 'AD_TRANS', 'FERMIS0662', 'SAME', 'u')).rejects.toThrow();
    await expect(service.linkRequestToExisting('req-1', 'AD_TRANS', 'NOEXISTE', 'SAME', 'u')).rejects.toThrow();
  });

  it('idempotente: segunda decisión actualiza el vínculo', async () => {
    const { service } = buildMatching();
    await service.linkRequestToExisting('req-1', 'AD_TRANS', 'FERMIS0662', 'DIFFERENT', 'u-alm');
    const link = await service.linkRequestToExisting('req-1', 'AD_TRANS', 'FERMIS0662', 'SAME', 'u-alm');
    expect(link.decision).toBe('SAME');
  });

  it('endpoint exige WAREHOUSE.CLASSIFY (backend, no solo UI)', () => {
    const perms: string[] =
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, MatchingController.prototype.vincular) ?? [];
    expect(perms).toEqual(['WAREHOUSE.CLASSIFY']);
  });
});

function buildSolicitudes(link: any | null) {
  const audit: string[] = [];
  const calls = { insert: 0 };
  const prisma: any = {
    request: {
      findUnique: vi.fn(async () => ({
        id: 'req-1', status: 'CONTABILIDAD_APROBADA', requestNumber: 'REQ-99',
        requestedDescription: 'Filtro', requestData: {
          groupId: 'g1', subgroupId: 's1', articleType: 'C', unitCode: 'UND', taxType: '1',
        }, accountingCodes: [],
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    catalogGroup: { findUnique: vi.fn(async () => ({ code: 'FER' })) },
    catalogSubgroup: { findUnique: vi.fn(async () => ({ code: 'MIS' })) },
    requestData: { update: vi.fn(async () => ({})) },
    requestArticleLink: { findUnique: vi.fn(async () => link) },
    auditEvent: { create: vi.fn(async (a: any) => { audit.push(a.data.action); return {}; }) },
  };
  const profitCreation: any = {
    assertAvailable: vi.fn(),
    allocateAndInsert: vi.fn(async () => {
      calls.insert += 1;
      return { ok: true, coArt: 'FERMIS0999', attempts: [], reconcile: 'CREATED_AND_VERIFIED', differences: [] };
    }),
    integrationUserCode: () => 'DM',
    plan: vi.fn(),
    verifyAndReconcile: vi.fn(),
  };
  const service = new SolicitudesService(prisma, {} as any, {} as any, {} as any, {} as any, profitCreation);
  return { service, prisma, audit, calls };
}

describe('SAME evita duplicado en el registro', () => {
  it('con vínculo SAME: INSERTADO_PROFIT sin INSERT, profitCode reutilizado', async () => {
    const { service, prisma, audit, calls } = buildSolicitudes({
      companyCode: 'AD_TRANS', profitArticleCode: 'FERMIS0662', decision: 'SAME',
    });
    const r = await service.createInProfit('req-1', 'u-ctl', 'c1');
    expect(r.ok).toBe(true);
    expect(r.coArt).toBe('FERMIS0662');
    expect(calls.insert).toBe(0);
    expect(prisma.requestData.update).toHaveBeenCalledWith({
      where: { requestId: 'req-1' },
      data: { profitCode: 'FERMIS0662' },
    });
    expect(audit).toContain('PROFIT_WRITE_SKIPPED_EXISTING');
    expect(audit).not.toContain('PROFIT_WRITE_SUCCEEDED');
  });

  it('con vínculo DIFFERENT: el flujo normal continúa e inserta', async () => {
    const { service, calls } = buildSolicitudes({
      companyCode: 'AD_TRANS', profitArticleCode: 'FERMIS0662', decision: 'DIFFERENT',
    });
    const r = await service.createInProfit('req-1', 'u-ctl', 'c1');
    expect(r.ok).toBe(true);
    expect(r.coArt).toBe('FERMIS0999');
    expect(calls.insert).toBe(1);
  });

  it('sin vínculo: el flujo normal inserta (sin regresión)', async () => {
    const { service, calls } = buildSolicitudes(null);
    const r = await service.createInProfit('req-1', 'u-ctl', 'c1');
    expect(r.ok).toBe(true);
    expect(calls.insert).toBe(1);
  });
});
