import { describe, it, expect, vi } from 'vitest';
import { MatchingService } from '../src/modulos/matching/application/matching.service';

function requestRow(over: any = {}) {
  return {
    id: 'req-9',
    status: 'PENDIENTE_ALMACEN',
    requestedDescription: 'Filtro aceite motor',
    purpose: 'Mantenimiento camión',
    referencePhotoUri: null,
    company: { code: 'AD_TRANS' },
    requestData: {
      brandCode: null, manufacturer: null, partNumber: null,
      groupId: null, subgroupId: null, unitCode: null, application: null,
      profitCode: null,
      ...over,
    },
  };
}

const prof = (company: string, code: string, over: any = {}) => {
  const pick = (key: string, dflt: any) => (key in over ? over[key] : dflt);
  return {
    companyCode: company,
    profitArticleCode: code,
    originalDescription: pick('description', 'FILTRO ACEITE DT466'),
    normalizedDescription: pick('description', 'FILTRO ACEITE DT466'),
    normalizationVersion: 'v2',
    brand: pick('brand', 'INTERNATIONAL'),
    model: pick('model', 'DT466'),
    partNumber: pick('partNumber', 'LF9009'),
    category: pick('category', 'FER'),
    subCategory: pick('subCategory', 'MIS'),
    unit: pick('unit', 'UND'),
    application: pick('application', 'CAMION'),
    photoReference: pick('photoReference', null),
    featuresJson: JSON.stringify({ technicalTokens: pick('technical', ['DT466', 'LF9009']) }),
  };
};

function buildAnalyzer(profiles: any[], requestOver: any = {}) {
  const audit: any[] = [];
  const links = new Map<string, any>();
  const decisions = new Map<string, any>();
  const prisma: any = {
    brand: { findMany: vi.fn(async () => []) },
    request: { findUnique: vi.fn(async ({ where }: any) => (where?.id === 'req-9' ? { ...requestRow(), ...requestOver } : null)) },
  };
  const repository: any = {
    listProfiles: vi.fn(async (limit: number, companyCode?: string) =>
      profiles.filter((p) => !companyCode || p.companyCode === companyCode).slice(0, limit),
    ),
    findDecisionsInvolving: vi.fn(async () => []),
    findProfile: vi.fn(), upsertProfile: vi.fn(), findDecision: vi.fn(), createDecision: vi.fn(),
    findRequestLink: vi.fn(async (id: string) => links.get(id) ?? null),
    upsertRequestLink: vi.fn(async (d: any) => {
      const row = { id: 'link-1', ...d };
      links.set(d.requestId, row);
      return row;
    }),
    listRequestDecisions: vi.fn(async (id: string) =>
      [...decisions.values()].filter((d) => d.requestId === id),
    ),
    upsertRequestDecision: vi.fn(async (d: any) => {
      const key = `${d.requestId}:${d.companyCode}:${d.profitArticleCode}`;
      const row = { id: `dec-${key}`, ...d };
      decisions.set(key, row);
      return row;
    }),
  };
  const profitAdapter: any = {
    getArticle: vi.fn(async (code: string) =>
      code && code !== 'NOEXISTE'
        ? { co_art: code, art_des: 'FILTRO', co_lin: 'FER', co_subl: 'MIS', co_cat: '01', co_color: '01', uni_venta: 'UND', stock_act: 0 }
        : null,
    ),
  };
  const auditoria: any = { logEvent: vi.fn(async (e: any) => { audit.push(e); return e; }) };
  const service = new MatchingService(prisma, profitAdapter, {} as any, repository, auditoria);
  return { service, audit, repository, links, decisions };
}

describe('23.2 historial DIFFERENT múltiple sin sobrescribir', () => {
  it('A→DIFFERENT y B→DIFFERENT coexisten; el vínculo refleja la última', async () => {
    const { service, decisions, links } = buildAnalyzer([]);
    await service.linkRequestToExisting('req-9', 'AD_TRANS', 'AAA', 'DIFFERENT', 'u-alm');
    await service.linkRequestToExisting('req-9', 'AD_TRANS', 'BBB', 'DIFFERENT', 'u-alm');
    expect(decisions.size).toBe(2);
    expect(decisions.get('req-9:AD_TRANS:AAA')?.decision).toBe('DIFFERENT');
    expect(decisions.get('req-9:AD_TRANS:BBB')?.decision).toBe('DIFFERENT');
    expect(links.get('req-9')?.profitArticleCode).toBe('BBB');
  });

  it('runAnalysis excluye todos los descartados del historial y marca el SAME', async () => {
    const { service } = buildAnalyzer([
      prof('AD_TRANS', 'AAA', { description: 'FILTRO ACEITE DT466' }),
      prof('AD_TRANS', 'BBB', { description: 'FILTRO ACEITE DT466' }),
      prof('AD_TRANS', 'CCC', { description: 'FILTRO ACEITE DT466' }),
    ]);
    await service.linkRequestToExisting('req-9', 'AD_TRANS', 'AAA', 'DIFFERENT', 'u-alm');
    await service.linkRequestToExisting('req-9', 'AD_TRANS', 'BBB', 'DIFFERENT', 'u-alm');
    await service.linkRequestToExisting('req-9', 'AD_TRANS', 'CCC', 'SAME', 'u-alm');
    const r = await service.analyzeDraft('req-9', { description: 'Filtro aceite DT466' });
    const codes = r.candidates.map((c) => c.article.profitArticleCode);
    expect(codes).not.toContain('AAA');
    expect(codes).not.toContain('BBB');
    expect(codes).toContain('CCC');
    expect(r.candidates.find((c) => c.article.profitArticleCode === 'CCC')?.priorDecision).toBe('SAME');
  });
});

describe('23.2 idempotencia SAME', () => {
  it('repetir SAME no duplica historial ni vínculo', async () => {
    const { service, decisions, repository, audit } = buildAnalyzer([]);
    await service.linkRequestToExisting('req-9', 'AD_TRANS', 'CCC', 'SAME', 'u-alm');
    await service.linkRequestToExisting('req-9', 'AD_TRANS', 'CCC', 'SAME', 'u-alm');
    expect(decisions.size).toBe(1);
    expect(repository.upsertRequestLink).toHaveBeenCalledTimes(2);
    const linked = audit.filter((e: any) => e.action === 'MATCH_REQUEST_LINKED');
    expect(linked.length).toBe(2);
  });
});

describe('23.2 borrador: campos sin señal no alteran el motor', () => {
  it('categoryCode/taxType se ignoran determinísticamente (motor congelado)', async () => {
    const { service } = buildAnalyzer([prof('AD_TRANS', 'A1')]);
    const base = await service.analyzeDraft('req-9', {
      description: 'Filtro de aceite International DT466',
      groupCode: 'FER', brandCode: 'INTERNATIONAL', unitCode: 'UND',
      partNumber: 'LF9009', application: 'CAMION',
    });
    const extra = await service.analyzeDraft('req-9', {
      description: 'Filtro de aceite International DT466',
      groupCode: 'FER', brandCode: 'INTERNATIONAL', unitCode: 'UND',
      partNumber: 'LF9009', application: 'CAMION',
      categoryCode: '01', taxType: '1',
    });
    expect(extra.candidates.map((c) => c.article.profitArticleCode))
      .toEqual(base.candidates.map((c) => c.article.profitArticleCode));
    expect(extra.candidates[0]?.score).toBe(base.candidates[0]?.score);
  });
});

describe('23.2 foto del artículo existente', () => {
  it('photoReference del perfil llega al detalle; sin foto queda undefined', async () => {
    const { service } = buildAnalyzer([
      prof('AD_TRANS', 'CONFOTO', { description: 'FILTRO ACEITE DT466', photoReference: 'FOTOS/FILTRO.JPG' }),
      prof('AD_TRANS', 'SINFOTO', { description: 'FILTRO ACEITE DT466' }),
    ]);
    const r = await service.analyzeDraft('req-9', { description: 'Filtro aceite DT466' });
    expect(r.candidates.find((c) => c.article.profitArticleCode === 'CONFOTO')?.detail?.photo)
      .toBe('FOTOS/FILTRO.JPG');
    expect(r.candidates.find((c) => c.article.profitArticleCode === 'SINFOTO')?.detail?.photo)
      .toBeUndefined();
  });
});
