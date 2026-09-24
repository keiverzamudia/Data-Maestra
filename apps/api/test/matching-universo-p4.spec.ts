import { describe, it, expect, vi, afterEach } from 'vitest';
import { MatchingService } from '../src/modulos/matching/application/matching.service';

/**
 * FASE P4 — resolución del universo Profit.
 *
 * Regresión real: la empresa de la solicitud era `EMP-A` (código local de
 * Data-Maestra, con guion) y se usaba tal cual como universo, por lo que
 * `/^[A-Z0-9_]{1,30}$/` rechazaba la consulta y TANTO `analizar` COMO
 * `buscar` devolvían 400 'La empresa del universo no es válida.'.
 *
 * Reglas a proteger:
 *  1) empresa de la solicitud solo si es código Profit listado en TEmpresas;
 *  2) si no lo es, se cae a PROFIT_DB_DATABASE (aquí AD_TRANS, donde viven
 *     los 11.194 perfiles);
 *  3) el motivo queda auditado (`universeSource`);
 *  4) sin empresa ni configuración sigue fallando con 400 (protección);
 *  5) el universo nunca se recibe sin resolver: ni local ni el respaldo en
 *     vivo reciben un código que safeDb rechazaría.
 */

const REQUEST_ID = 'req-9';
const PROFILE_DESC = 'SENSOR DE POSICIÓN DE EFECTO HALL';

function requestRow(companyCode: string) {
  return {
    id: REQUEST_ID,
    status: 'PENDIENTE_ALMACEN',
    requestedDescription: PROFILE_DESC,
    purpose: 'Señalización',
    referencePhotoUri: null,
    company: { code: companyCode },
    requestData: {
      brandCode: null, manufacturer: null, partNumber: null,
      groupId: null, subgroupId: null, unitCode: null, application: null,
      profitCode: null,
    },
  };
}

function build(opts: {
  companyCode: string;
  profiles?: any[];
  listed?: string[];
  withConfig?: boolean;
}) {
  const audit: any[] = [];
  const profiles = opts.profiles ?? [
    {
      companyCode: 'AD_TRANS',
      profitArticleCode: '338-1488-CAT',
      originalDescription: PROFILE_DESC,
      normalizedDescription: 'SENSOR DE POSICION DE EFECTO HALL',
      normalizationVersion: 'v2',
      brand: null, model: null, partNumber: null,
      category: null, subCategory: null, unit: null, application: null,
      featuresJson: JSON.stringify({ technicalTokens: [] }),
    },
  ];
  const listed = opts.listed ?? ['AD_TRANS'];
  const prisma: any = {
    brand: { findMany: vi.fn(async () => []) },
    request: { findUnique: vi.fn(async () => requestRow(opts.companyCode)) },
  };
  const repository: any = {
    listProfiles: vi.fn(async (limit: number, companyCode?: string) =>
      profiles.filter((p) => !companyCode || p.companyCode === companyCode).slice(0, limit)),
    countProfiles: vi.fn(async (companyCode?: string) =>
      profiles.filter((p) => !companyCode || p.companyCode === companyCode).length),
    searchProfiles: vi.fn(async (company: string, term: string, limit: number) =>
      profiles
        .filter((p) => p.companyCode === company)
        .filter((p) => p.profitArticleCode.includes(term) || p.originalDescription.includes(term))
        .slice(0, limit)),
    findDecisionsInvolving: vi.fn(async () => []),
    findRequestLink: vi.fn(async () => null),
    listRequestDecisions: vi.fn(async () => []),
  };
  const companies: any = {
    isListed: vi.fn(async (code: string) =>
      listed.includes(code) ? { code, name: code, rif: '' } : null),
  };
  const auditoria: any = { logEvent: vi.fn(async (e: any) => { audit.push(e); return e; }) };
  const universe: any = { searchArticles: vi.fn(async () => []) };
  const config: any = opts.withConfig === false
    ? undefined
    : { get: vi.fn((key: string) => (key === 'PROFIT_DB_DATABASE' ? 'AD_TRANS' : undefined)) };
  const service = new MatchingService(
    prisma, {} as any, companies, repository, auditoria, universe, config,
  );
  return { service, repository, universe, audit, companies };
}

const lastAudit = (audit: any[], action: string) =>
  [...audit].reverse().find((e) => e.action === action);

const ORIGINAL_ENV_DB = process.env.PROFIT_DB_DATABASE;

afterEach(() => {
  if (ORIGINAL_ENV_DB === undefined) delete process.env.PROFIT_DB_DATABASE;
  else process.env.PROFIT_DB_DATABASE = ORIGINAL_ENV_DB;
});

describe('resolución de universo — FASE P4', () => {
  it('analizar: empresa local EMP-A ya no devuelve 400 y usa el universo configurado', async () => {
    const { service, repository, audit } = build({ companyCode: 'EMP-A' });
    const r = await service.analyzeDraft(REQUEST_ID, { description: PROFILE_DESC });

    expect(repository.listProfiles).toHaveBeenCalledWith(500, 'AD_TRANS');
    expect(r.insufficient).toBe(false);
    expect(r.candidates.length).toBeGreaterThan(0);

    const ev = lastAudit(audit, 'MATCH_CANDIDATES_CONSULTED');
    const data = JSON.parse(ev.afterData);
    expect(data.universeCompanyCode).toBe('AD_TRANS');
    expect(data.universeSource).toBe('CONFIG_FALLBACK');
  });

  it('analizar: empresa listada en TEmpresas se usa como universo (sin caer a config)', async () => {
    const { service, repository, audit } = build({
      companyCode: 'AD_DIST',
      listed: ['AD_DIST', 'AD_TRANS'],
      profiles: [{
        companyCode: 'AD_DIST',
        profitArticleCode: 'A1',
        originalDescription: PROFILE_DESC,
        normalizedDescription: PROFILE_DESC,
        normalizationVersion: 'v2',
        brand: null, model: null, partNumber: null,
        category: null, subCategory: null, unit: null, application: null,
        featuresJson: JSON.stringify({ technicalTokens: [] }),
      }],
    });
    await service.analyzeDraft(REQUEST_ID, { description: PROFILE_DESC });

    expect(repository.listProfiles).toHaveBeenCalledWith(500, 'AD_DIST');
    const data = JSON.parse(lastAudit(audit, 'MATCH_CANDIDATES_CONSULTED').afterData);
    expect(data.universeSource).toBe('EMPRESA_SOLICITUD');
  });

  it('analizar: un universo explícito solo se respeta si está listado', async () => {
    const { service, repository } = build({ companyCode: 'EMP-A' });
    await service.analyzeDraft(REQUEST_ID, { description: PROFILE_DESC }, {
      universeCompanyCode: 'EMP-B',
    });
    expect(repository.listProfiles).toHaveBeenCalledWith(500, 'AD_TRANS');

    await service.analyzeDraft(REQUEST_ID, { description: PROFILE_DESC }, {
      universeCompanyCode: 'AD_TRANS',
    });
    expect(repository.listProfiles).toHaveBeenLastCalledWith(500, 'AD_TRANS');
  });

  it('buscar: con EMP-A busca en el universo real y no lanza 400', async () => {
    const { service, repository, universe, audit } = build({ companyCode: 'EMP-A' });
    const r = await service.searchManualArticle(REQUEST_ID, 'SENSOR', { actorId: 'u-1' });

    expect(repository.searchProfiles).toHaveBeenCalledWith('AD_TRANS', 'SENSOR', 20);
    expect(universe.searchArticles).not.toHaveBeenCalled();
    expect(r.companyCode).toBe('AD_TRANS');
    expect(r.source).toBe('LOCAL');
    expect(r.results.map((x) => x.profitArticleCode)).toEqual(['338-1488-CAT']);

    const data = JSON.parse(lastAudit(audit, 'MANUAL_ARTICLE_SEARCH').afterData);
    expect(data.universeSource).toBe('CONFIG_FALLBACK');
  });

  it('buscar: si el local está vacío, el respaldo en vivo recibe el universo resuelto (nunca EMP-A)', async () => {
    const { service, universe, audit } = build({ companyCode: 'EMP-A' });
    const r = await service.searchManualArticle(REQUEST_ID, 'TORNILLO');

    expect(universe.searchArticles).toHaveBeenCalledWith('AD_TRANS', 'TORNILLO', 20);
    expect(universe.searchArticles).not.toHaveBeenCalledWith('EMP-A', expect.anything(), expect.anything());
    expect(r.source).toBe('PROFIT');
    expect(JSON.parse(lastAudit(audit, 'MANUAL_ARTICLE_SEARCH').afterData).universeSource)
      .toBe('CONFIG_FALLBACK');
  });

  it('buscar: empresa listada distinta se usa en local y en el respaldo', async () => {
    const { service, repository, universe } = build({
      companyCode: 'AD_DIST',
      listed: ['AD_DIST', 'AD_TRANS'],
      profiles: [],
    });
    await service.searchManualArticle(REQUEST_ID, 'FILTRO');
    expect(repository.searchProfiles).toHaveBeenCalledWith('AD_DIST', 'FILTRO', 20);
    expect(universe.searchArticles).toHaveBeenCalledWith('AD_DIST', 'FILTRO', 20);
  });

  it('protección intacta: sin empresa y sin configuración sigue siendo 400', async () => {
    process.env.PROFIT_DB_DATABASE = '';
    const { service } = build({ companyCode: '', withConfig: false });
    await expect(service.searchManualArticle(REQUEST_ID, 'FILTRO')).rejects.toThrow(
      /empresa del universo no es válida/,
    );
    await expect(service.analyzeDraft(REQUEST_ID, { description: PROFILE_DESC })).rejects.toThrow(
      /empresa del universo no es válida/,
    );
  });

  it('sin ConfigService se recurre a process.env.PROFIT_DB_DATABASE', async () => {
    process.env.PROFIT_DB_DATABASE = 'AD_TRANS';
    const { service, repository } = build({ companyCode: 'EMP-A', withConfig: false });
    await service.analyzeDraft(REQUEST_ID, { description: PROFILE_DESC });
    expect(repository.listProfiles).toHaveBeenCalledWith(500, 'AD_TRANS');
  });
});
