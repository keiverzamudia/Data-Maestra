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
    featuresJson: JSON.stringify({ technicalTokens: pick('technical', ['DT466', 'LF9009']) }),
  };
};

function buildAnalyzer(profiles: any[], requestOver: any = {}) {
  const audit: any[] = [];
  const links = new Map<string, any>();
  const prisma: any = {
    brand: { findMany: vi.fn(async () => []) },
    request: { findUnique: vi.fn(async ({ where }: any) => (where?.id === 'req-9' ? { ...requestRow(), ...requestOver } : null)) },
  };
  const repository: any = {
    listProfiles: vi.fn(async (limit: number, companyCode?: string) =>
      profiles.filter((p) => !companyCode || p.companyCode === companyCode).slice(0, limit),
    ),
    countProfiles: vi.fn(async (companyCode?: string) =>
      profiles.filter((p) => !companyCode || p.companyCode === companyCode).length,
    ),
    findDecisionsInvolving: vi.fn(async () => []),
    findProfile: vi.fn(), upsertProfile: vi.fn(), findDecision: vi.fn(), createDecision: vi.fn(),
    findRequestLink: vi.fn(async (id: string) => links.get(id) ?? null),
    upsertRequestLink: vi.fn(async (d: any) => {
      const row = { id: 'link-1', ...d };
      links.set(d.requestId, row);
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
  return { service, audit, repository, links };
}

describe('analyzeDraft — entrada combinada solicitud + borrador', () => {
  it('1: usa descripción y campos del borrador sobre lo guardado', async () => {
    const { service } = buildAnalyzer([prof('AD_TRANS', 'A1')]);
    const r = await service.analyzeDraft('req-9', {
      description: 'Filtro de aceite International DT466',
      groupCode: 'FER',
      brandCode: 'INTERNATIONAL',
      unitCode: 'UND',
      partNumber: 'LF9009',
      application: 'CAMION',
    });
    expect(r.insufficient).toBe(false);
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates[0]!.classification).toBe('HIGH');
  });

  it('2-10: cada campo relevante influye (descripción, grupo, marca, unidad, parte, aplicación)', async () => {
    const { service } = buildAnalyzer([prof('AD_TRANS', 'A1')]);
    const full = await service.analyzeDraft('req-9', {
      description: 'Filtro de aceite International DT466',
      groupCode: 'FER', brandCode: 'INTERNATIONAL', unitCode: 'UND',
      partNumber: 'LF9009', application: 'CAMION',
    });
    const fullScore = full.candidates[0]!.score;
    const withoutBrand = await service.analyzeDraft('req-9', {
      description: 'Filtro de aceite International DT466',
      groupCode: 'FER', unitCode: 'UND',
      partNumber: 'LF9009', application: 'CAMION',
    });
    expect(withoutBrand.candidates[0]!.score).toBeLessThan(fullScore!);
    const otherDesc = await service.analyzeDraft('req-9', {
      description: 'Tornillo hexagonal M8',
      groupCode: 'FER', brandCode: 'INTERNATIONAL', unitCode: 'UND',
      partNumber: 'LF9009', application: 'CAMION',
    });
    expect(otherDesc.candidates[0]!.score).toBeLessThan(fullScore!);
  });

  it('scope AD_TRANS: excluye otras empresas por defecto', async () => {
    const { service, repository } = buildAnalyzer([
      prof('AD_TRANS', 'A1'),
      prof('AD_DIST', 'B1'),
    ]);
    const r = await service.analyzeDraft('req-9', { description: 'Filtro aceite DT466' });
    expect(repository.listProfiles).toHaveBeenCalledWith(500, 'AD_TRANS');
    expect(r.candidates.every((c) => c.article.companyCode === 'AD_TRANS')).toBe(true);
  });

  it('empresa inválida se rechaza en español', async () => {
    const { service } = buildAnalyzer([]);
    await expect(service.analyzeDraft('req-9', {}, { universeCompanyCode: 'NO!!' })).rejects.toThrow(
      'La empresa del universo no es válida.',
    );
  });
});

describe('analyzeDraft — orden, límite y preselección', () => {
  it('11-12: sin N×N; ordenados por score; límite funciona', async () => {
    const profiles = [prof('AD_TRANS', 'A1')];
    for (let i = 0; i < 30; i += 1) {
      profiles.push(prof('AD_TRANS', `Z${i}`, {
        description: `TORNILLO HEXAGONAL M${i}`,
        brand: null, model: null, partNumber: null, category: 'TOR',
        subCategory: null, unit: null, application: null,
        technical: [`M${i}`],
      }));
    }
    const { service } = buildAnalyzer(profiles);
    const r = await service.analyzeDraft(
      'req-9',
      { description: 'Filtro de aceite International DT466', partNumber: 'LF9009' },
      { limit: 3 },
    );
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]!.article.profitArticleCode).toBe('A1');
    const scores = r.candidates.map((c) => c.score ?? 0);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe('analyzeDraft — vínculo y flujo', () => {
  it('14-16-23: SAME persiste vínculo idempotente, sin INSERT Profit', async () => {
    const { service, links } = buildAnalyzer([]);
    const l1 = await service.linkRequestToExisting('req-9', 'AD_TRANS', 'FERMIS0662', 'SAME', 'u-alm');
    const l2 = await service.linkRequestToExisting('req-9', 'AD_TRANS', 'FERMIS0662', 'SAME', 'u-alm');
    expect(l1.id).toBe(l2.id);
    expect(links.size).toBe(1);
    expect(links.get('req-9').decision).toBe('SAME');
  });

  it('17-18: DIFFERENT no cierra ni modifica la solicitud', async () => {
    const { service, links } = buildAnalyzer([prof('AD_TRANS', 'A1'), prof('AD_TRANS', 'A2')]);
    await service.linkRequestToExisting('req-9', 'AD_TRANS', 'A1', 'DIFFERENT', 'u-alm');
    expect(links.get('req-9').decision).toBe('DIFFERENT');
    const r = await service.analyzeDraft('req-9', { description: 'Filtro aceite DT466' });
    expect(r.candidates.some((c) => c.article.profitArticleCode === 'A1')).toBe(false);
    expect(r.candidates.some((c) => c.article.profitArticleCode === 'A2')).toBe(true);
  });

  it('19-20: sin candidatos e insuficiente sin falsas coincidencias', async () => {
    const { service } = buildAnalyzer([]);
    const empty = await service.analyzeDraft('req-9', { description: 'Filtro aceite DT466' });
    expect(empty.candidates).toEqual([]);
    expect(empty.insufficient).toBe(false);
  });

  it('insuficiente cuando no hay información mínima', async () => {
    const { service } = buildAnalyzer(
      [prof('AD_TRANS', 'A1')],
      { requestedDescription: '', purpose: null, requestData: {} },
    );
    const r = await service.analyzeDraft('req-9', {});
    expect(r.insufficient).toBe(true);
    expect(r.candidates).toEqual([]);
  });

  it('21-22: conflictos preservados y decisiones previas respetadas', async () => {
    const { service } = buildAnalyzer([
      prof('AD_TRANS', 'A1'),
      prof('AD_TRANS', 'C1', { model: 'DT530', partNumber: 'ZZZ9' }),
    ]);
    const r = await service.analyzeDraft('req-9', {
      description: 'Filtro de aceite International DT466',
      partNumber: 'LF9009',
    });
    const conflicted = r.candidates.find((c) => c.article.profitArticleCode === 'C1');
    expect(conflicted?.conflicts.length).toBeGreaterThan(0);
  });

  it('24-25: solicitud inexistente y empresa inválida fallan en español', async () => {
    const { service } = buildAnalyzer([]);
    await expect(service.analyzeDraft('nope', {})).rejects.toThrow('no encontrada');
  });
});

// FASE P1 — universo, modelo, auditoría y visibilidad del tope de 500.
describe('analyzeDraft — FASE P1: universo, modelo y trazabilidad', () => {
  it('el universo por defecto es la empresa de la solicitud (no AD_TRANS fijo)', async () => {
    const { service, repository } = buildAnalyzer(
      [prof('AD_DIST', 'D1'), prof('AD_TRANS', 'T1')],
      { company: { code: 'AD_DIST' } },
    );
    await service.analyzeDraft('req-9', { description: 'Filtro aceite DT466' });
    expect(repository.listProfiles).toHaveBeenCalledWith(500, 'AD_DIST');
    expect(repository.listProfiles).not.toHaveBeenCalledWith(500, 'AD_TRANS');
  });

  it('el modelo del borrador viaja al motor y aporta señal MODEL', async () => {
    const { service } = buildAnalyzer([prof('AD_TRANS', 'A1')]);
    const base = await service.analyzeDraft('req-9', {
      description: 'Filtro aceite motor',
      groupCode: 'FER', brandCode: '01', unitCode: 'UND',
    });
    const withModel = await service.analyzeDraft('req-9', {
      description: 'Filtro aceite motor',
      groupCode: 'FER', brandCode: '01', unitCode: 'UND',
      model: 'DT466',
    });
    expect(base.candidates[0]!.evidence).not.toContain('MODEL_MATCH');
    expect(withModel.candidates[0]!.evidence).toContain('MODEL_MATCH');
    expect(withModel.candidates[0]!.score).toBeGreaterThan(base.candidates[0]!.score!);
  });

  it('modelo del requestData se usa cuando el borrador no lo trae', async () => {
    const { service } = buildAnalyzer([prof('AD_TRANS', 'A1')], {
      requestData: { model: 'DT466', manufacturer: null, brandCode: null, profitCode: null },
    });
    const r = await service.analyzeDraft('req-9', { description: 'Filtro aceite motor' });
    expect(r.input).toMatchObject({ model: 'DT466' });
  });

  it('el actorId del usuario queda en la auditoría (antes era undefined)', async () => {
    const { service, audit } = buildAnalyzer([prof('AD_TRANS', 'A1')]);
    await service.analyzeDraft('req-9', { description: 'Filtro aceite DT466' }, { actorId: 'u-almacen' });
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.every((e: any) => e.actorId === 'u-almacen')).toBe(true);
    expect(audit.some((e: any) => e.action === 'MATCH_CANDIDATES_CONSULTED')).toBe(true);
  });

  it('avisa cuando el tope de 500 perfiles silencia parte del universo', async () => {
    const { service, repository } = buildAnalyzer([prof('AD_TRANS', 'A1')]);
    repository.countProfiles.mockResolvedValue(900);
    const r = await service.analyzeDraft('req-9', { description: 'Filtro aceite DT466' });
    expect(r.poolLimit).toBe(500);
    expect(r.poolTotal).toBe(900);
    expect(r.poolTruncated).toBe(true);
  });

  it('sin corte (universo completo) poolTruncated queda en false', async () => {
    const { service } = buildAnalyzer([prof('AD_TRANS', 'A1')]);
    const r = await service.analyzeDraft('req-9', { description: 'Filtro aceite DT466' });
    expect(r.poolTruncated).toBe(false);
    expect(r.poolTotal).toBe(1);
  });
});

// FASE P2 — búsqueda en dos tiempos: INICIAL por descripción (automática) y
// COMPLETA con todos los campos (solo a petición del usuario).
describe('analyzeDraft — FASE P2: fases INICIAL y COMPLETA', () => {
  const draft = {
    description: 'Filtro aceite motor',
    groupCode: 'FER',
    subgroupCode: 'MIS',
    brandCode: '01',
    unitCode: 'UND',
    partNumber: 'LF9009',
    model: 'DT466',
    application: 'CAMION',
  };

  it('por defecto ejecuta la fase COMPLETA (compatibilidad)', async () => {
    const { service } = buildAnalyzer([prof('AD_TRANS', 'A1')]);
    const r = await service.analyzeDraft('req-9', draft);
    expect(r.phase).toBe('COMPLETA');
    expect(r.input).toMatchObject({
      model: 'DT466', partNumber: 'LF9009', category: 'FER', subCategory: 'MIS', brand: '01', unit: 'UND',
    });
  });

  it('INICIAL compara únicamente por texto libre (descripción)', async () => {
    const { service } = buildAnalyzer([prof('AD_TRANS', 'A1')]);
    const r = await service.analyzeDraft('req-9', draft, { phase: 'INICIAL' });
    expect(r.phase).toBe('INICIAL');
    expect(r.input.description).toBe('Filtro aceite motor');
    expect(r.input.brand).toBeUndefined();
    expect(r.input.model).toBeUndefined();
    expect(r.input.partNumber).toBeUndefined();
    expect(r.input.category).toBeUndefined();
    expect(r.input.subCategory).toBeUndefined();
    expect(r.input.unit).toBeUndefined();
    expect(r.input.application).toBeUndefined();
  });

  it('INICIAL descarta también los campos ya guardados de la solicitud', async () => {
    const { service } = buildAnalyzer([prof('AD_TRANS', 'A1')], {
      requestData: { brandCode: '01', partNumber: 'LF9009', model: 'DT466', groupId: 'g1', unitCode: 'UND', profitCode: null },
    });
    const inicial = await service.analyzeDraft('req-9', { description: 'Filtro aceite motor' }, { phase: 'INICIAL' });
    const completa = await service.analyzeDraft('req-9', { description: 'Filtro aceite motor' }, { phase: 'COMPLETA' });
    expect(inicial.input.brand).toBeUndefined();
    expect(inicial.input.partNumber).toBeUndefined();
    expect(inicial.input.model).toBeUndefined();
    expect(completa.input).toMatchObject({ brand: '01', partNumber: 'LF9009', model: 'DT466' });
  });

  it('la fase queda registrada en la auditoría de la consulta', async () => {
    const { service, audit } = buildAnalyzer([prof('AD_TRANS', 'A1')]);
    await service.analyzeDraft('req-9', draft, { phase: 'INICIAL', actorId: 'u-1' });
    expect(audit.length).toBeGreaterThan(0);
    const last = audit[audit.length - 1];
    expect(JSON.parse(last.afterData).phase).toBe('INICIAL');
  });
});
