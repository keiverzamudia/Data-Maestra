import { describe, it, expect, vi } from 'vitest';
import { MatchingService } from '../src/modulos/matching/application/matching.service';

/**
 * FASE P3 — Búsqueda manual de un artículo en Profit desde el Analizador.
 * Reglas a proteger:
 *  1) primero el universo local; solo si está vacío se consulta Profit;
 *  2) es solo consulta: no decide, no vincula, no escribe en Profit;
 *  3) toda búsqueda queda auditada;
 *  4) el término se valida antes de tocar cualquier fuente.
 */

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

const profile = (code: string, description: string) => ({
  companyCode: 'AD_TRANS',
  profitArticleCode: code,
  originalDescription: description,
  brand: 'INTERNATIONAL',
  model: 'DT466',
});

function buildSearch(profiles: any[], opts: { profitRows?: any[]; withUniverse?: boolean } = {}) {
  const audit: any[] = [];
  const prisma: any = {
    brand: { findMany: vi.fn(async () => []) },
    request: { findUnique: vi.fn(async ({ where }: any) => (where?.id === 'req-9' ? requestRow() : null)) },
  };
  const repository: any = {
    searchProfiles: vi.fn(async (company: string, term: string, limit: number) =>
      profiles
        .filter((p) => p.companyCode === company)
        .filter((p) =>
          p.profitArticleCode.includes(term) || p.originalDescription.includes(term),
        )
        .slice(0, limit),
    ),
  };
  const universe: any = { searchArticles: vi.fn(async () => opts.profitRows ?? []) };
  const auditoria: any = { logEvent: vi.fn(async (e: any) => { audit.push(e); return e; }) };
  // FASE P4: catálogo corporativo + configuración explícitos para que la
  // resolución del universo sea determinista (no depende del entorno).
  const companies: any = { isListed: vi.fn(async (c: string) => (c === 'AD_TRANS' ? { code: c } : null)) };
  const config: any = { get: vi.fn((k: string) => (k === 'PROFIT_DB_DATABASE' ? 'AD_TRANS' : undefined)) };
  const service = new MatchingService(
    prisma,
    {} as any,
    companies,
    repository,
    auditoria,
    opts.withUniverse === false ? undefined : universe,
    config,
  );
  return { service, repository, universe, audit };
}

describe('searchManualArticle — FASE P3', () => {
  it('rechaza el término antes de tocar cualquier fuente si tiene menos de 2 caracteres', async () => {
    const { service, repository, universe } = buildSearch([]);
    await expect(service.searchManualArticle('req-9', 'F')).rejects.toThrow(
      /al menos 2 caracteres/,
    );
    expect(repository.searchProfiles).not.toHaveBeenCalled();
    expect(universe.searchArticles).not.toHaveBeenCalled();
  });

  it('rechaza un término de más de 60 caracteres', async () => {
    const { service } = buildSearch([]);
    await expect(service.searchManualArticle('req-9', 'x'.repeat(61))).rejects.toThrow(
      /60 caracteres/,
    );
  });

  it('encuentra en el universo local y NO consulta Profit', async () => {
    const { service, repository, universe } = buildSearch([
      profile('FERMIS0662', 'FILTRO DE ACEITE MOTOR'),
    ]);
    const r = await service.searchManualArticle('req-9', 'FILTRO', { actorId: 'u-1' });
    expect(repository.searchProfiles).toHaveBeenCalledWith('AD_TRANS', 'FILTRO', 20);
    expect(universe.searchArticles).not.toHaveBeenCalled();
    expect(r.source).toBe('LOCAL');
    expect(r.companyCode).toBe('AD_TRANS');
    expect(r.results).toEqual([
      {
        companyCode: 'AD_TRANS',
        profitArticleCode: 'FERMIS0662',
        description: 'FILTRO DE ACEITE MOTOR',
        brand: 'INTERNATIONAL',
        model: 'DT466',
      },
    ]);
  });

  it('si el universo local no lo tiene, consulta Profit en vivo (respaldo)', async () => {
    const { service, repository, universe } = buildSearch([], {
      profitRows: [{ co_art: 'FERMIS0710', art_des: 'FILTRO DE COMBUSTIBLE', co_color: '01', modelo: 'DT466' }],
    });
    const r = await service.searchManualArticle('req-9', 'FILTRO');
    expect(repository.searchProfiles).toHaveBeenCalledTimes(1);
    expect(universe.searchArticles).toHaveBeenCalledWith('AD_TRANS', 'FILTRO', 20);
    expect(r.source).toBe('PROFIT');
    expect(r.results).toEqual([
      {
        companyCode: 'AD_TRANS',
        profitArticleCode: 'FERMIS0710',
        description: 'FILTRO DE COMBUSTIBLE',
        brand: '01',
        model: 'DT466',
      },
    ]);
  });

  it('sin universo disponible devuelve vacío sin fingir una consulta a Profit', async () => {
    const { service, universe } = buildSearch([], { withUniverse: false });
    const r = await service.searchManualArticle('req-9', 'TORNILLO');
    expect(universe.searchArticles).not.toHaveBeenCalled();
    expect(r.source).toBe('LOCAL');
    expect(r.results).toEqual([]);
  });

  it('el universo se limita a la empresa de la solicitud', async () => {
    const profiles = [profile('FERMIS0662', 'FILTRO'), { ...profile('OTRA0001', 'FILTRO'), companyCode: 'AD_DIST' }];
    const { service } = buildSearch(profiles);
    const r = await service.searchManualArticle('req-9', 'FILTRO');
    expect(r.results.map((x) => x.companyCode)).toEqual(['AD_TRANS']);
  });

  it('auditoría: cada búsqueda queda registrada con término, empresa, fuente y total', async () => {
    const { service, audit } = buildSearch([profile('FERMIS0662', 'FILTRO')]);
    await service.searchManualArticle('req-9', 'FILTRO', { actorId: 'u-almacen' });
    expect(audit).toHaveLength(1);
    const last = audit[0];
    expect(last.action).toBe('MANUAL_ARTICLE_SEARCH');
    expect(last.actorId).toBe('u-almacen');
    expect(last.requestId).toBe('req-9');
    expect(JSON.parse(last.afterData)).toEqual({
      term: 'FILTRO',
      companyCode: 'AD_TRANS',
      universeSource: 'EMPRESA_SOLICITUD',
      source: 'LOCAL',
      count: 1,
    });
  });

  it('acota el límite entre 1 y 50 antes de pedirlo a las fuentes', async () => {
    const { service, repository, universe } = buildSearch([]);
    await service.searchManualArticle('req-9', 'FILTRO', { limit: 999 });
    expect(repository.searchProfiles).toHaveBeenCalledWith('AD_TRANS', 'FILTRO', 50);
    await service.searchManualArticle('req-9', 'FILTRO', { limit: 0 });
    expect(repository.searchProfiles).toHaveBeenLastCalledWith('AD_TRANS', 'FILTRO', 1);
    expect(universe.searchArticles).toHaveBeenCalledWith('AD_TRANS', 'FILTRO', 50);
    expect(universe.searchArticles).toHaveBeenLastCalledWith('AD_TRANS', 'FILTRO', 1);
  });

  it('falla con claridad si la solicitud no tiene empresa de universo válida', async () => {
    const prisma: any = {
      brand: { findMany: vi.fn(async () => []) },
      request: {
        findUnique: vi.fn(async () => ({ ...requestRow(), company: { code: '' } })),
      },
    };
    const service = new MatchingService(
      prisma, {} as any, {} as any,
      { searchProfiles: vi.fn(async () => []) } as any,
      { logEvent: vi.fn(async () => ({})) } as any,
      undefined,
      // FASE P4: sin configuración disponible → debe seguir fallando con 400.
      { get: vi.fn(() => '') } as any,
    );
    await expect(service.searchManualArticle('req-9', 'FILTRO')).rejects.toThrow(
      /empresa del universo no es válida/,
    );
  });
});
