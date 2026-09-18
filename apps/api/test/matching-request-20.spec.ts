import { describe, it, expect, vi } from 'vitest';
import { MatchingService } from '../src/modulos/matching/application/matching.service';

function requestRow(profitCode: string | null = null) {
  return {
    id: 'req-9',
    requestedDescription: 'Filtro aceite DT466',
    purpose: 'Mantenimiento',
    referencePhotoUri: null,
    company: { code: 'AD_TRANS' },
    requestData: {
      brandCode: 'INTERNATIONAL', manufacturer: null, partNumber: 'LF9009',
      groupId: 'FER', subgroupId: 'MIS', unitCode: 'UND', application: 'CAMION',
      profitCode,
    },
  };
}

function buildRequestService(profiles: any[], decisions: any[] = [], profitCode: string | null = null) {
  const audit: any[] = [];
  const prisma: any = {
    brand: { findMany: vi.fn(async () => []) },
    request: { findUnique: vi.fn(async () => requestRow(profitCode)) },
  };
  const repository: any = {
    listProfiles: vi.fn(async () => profiles),
    findDecisionsInvolving: vi.fn(async () => decisions),
    findProfile: vi.fn(), upsertProfile: vi.fn(), findDecision: vi.fn(), createDecision: vi.fn(),
    findRequestLink: vi.fn(async () => null),
  };
  const auditoria: any = { logEvent: vi.fn(async (e: any) => { audit.push(e); return e; }) };
  const service = new MatchingService(prisma, {} as any, {} as any, repository, auditoria);
  return { service, audit };
}

const prof = (company: string, code: string, over: any = {}) => ({
  companyCode: company,
  profitArticleCode: code,
  originalDescription: over.description ?? 'FILTRO ACEITE DT466',
  normalizedDescription: over.description ?? 'FILTRO ACEITE DT466',
  normalizationVersion: 'v2',
  brand: over.brand ?? 'INTERNATIONAL',
  model: over.model ?? 'DT466',
  partNumber: over.partNumber ?? 'LF9009',
  category: over.category ?? 'FER',
  subCategory: over.subCategory ?? 'MIS',
  unit: over.unit ?? 'UND',
  application: over.application ?? 'CAMION',
  featuresJson: JSON.stringify({ technicalTokens: over.technical ?? ['DT466', 'LF9009'] }),
});

describe('findCandidatesForRequest (§29)', () => {
  it('encuentra candidatos reales con explicación en español y versión', async () => {
    const { service, audit } = buildRequestService([prof('AD_TRANS', 'A1')]);
    const r = await service.findCandidatesForRequest('req-9');
    expect(r.engineVersion).toBe('v1');
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates[0]!.classification).toBe('HIGH');
    expect(r.candidates[0]!.explanation).toContain('Se muestra porque');
    expect(r.candidates[0]!.explanation).not.toMatch(/score|confidence/i);
    expect(audit.filter((e) => e.action === 'MATCH_CANDIDATES_CONSULTED')).toHaveLength(1);
  });

  it('Caso 10: decisión SAME previa se reconoce (priorDecision, no desconocida)', async () => {
    const { service } = buildRequestService(
      [prof('AD_DIST', 'B1')],
      [{
        pairKey: 'AD_DIST:B1|AD_TRANS:REG9',
        decision: 'SAME',
        articleACompany: 'AD_DIST', articleAProfitCode: 'B1',
        articleBCompany: 'AD_TRANS', articleBProfitCode: 'REG9',
      }],
      'REG9',
    );
    const r = await service.findCandidatesForRequest('req-9');
    const marked = r.candidates.find((c) => c.article.profitArticleCode === 'B1');
    expect(marked?.priorDecision).toBe('SAME');
  });

  it('Caso 11: decisión DIFFERENT previa excluye la pareja', async () => {
    const { service } = buildRequestService(
      [prof('AD_DIST', 'B1'), prof('AD_DIST', 'B2')],
      [{
        pairKey: 'AD_DIST:B1|AD_TRANS:REG9',
        decision: 'DIFFERENT',
        articleACompany: 'AD_DIST', articleAProfitCode: 'B1',
        articleBCompany: 'AD_TRANS', articleBProfitCode: 'REG9',
      }],
      'REG9',
    );
    const r = await service.findCandidatesForRequest('req-9');
    expect(r.candidates.some((c) => c.article.profitArticleCode === 'B1')).toBe(false);
    expect(r.candidates.some((c) => c.article.profitArticleCode === 'B2')).toBe(true);
  });

  it('Caso 35/36: no modifica solicitud/Profit y no escribe en Profit', async () => {
    const profitAdapter: any = { getArticle: vi.fn(), insertArticle: vi.fn(), updateArticle: vi.fn() };
    const prisma: any = {
      brand: { findMany: vi.fn(async () => []) },
      request: {
        findUnique: vi.fn(async () => ({
          id: 'req-9',
          requestedDescription: 'Filtro aceite DT466',
          purpose: null,
          referencePhotoUri: null,
          company: { code: 'AD_TRANS' },
          requestData: {},
        })),
        update: vi.fn(),
      },
    };
    const repository: any = {
      listProfiles: vi.fn(async () => [prof('AD_TRANS', 'A1')]),
      findDecisionsInvolving: vi.fn(async () => []),
      findProfile: vi.fn(), upsertProfile: vi.fn(), findDecision: vi.fn(), createDecision: vi.fn(),
      findRequestLink: vi.fn(async () => null),
    };
    const service = new MatchingService(prisma, profitAdapter, {} as any, repository, { logEvent: vi.fn(async () => ({})) } as any);
    await service.findCandidatesForRequest('req-9');
    expect(profitAdapter.getArticle).not.toHaveBeenCalled();
    expect(profitAdapter.insertArticle).not.toHaveBeenCalled();
    expect(prisma.request.update).not.toHaveBeenCalled();
  });
});
