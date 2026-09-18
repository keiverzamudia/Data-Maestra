import { describe, it, expect, vi } from 'vitest';
import { MatchingService } from '../src/modulos/matching/application/matching.service';

function buildService() {
  const profiles = new Map<string, any>();
  const decisions = new Map<string, any>();
  const audit: any[] = [];
  const prisma: any = {
    brand: { findMany: vi.fn(async () => []) },
    articleNormalizationProfile: {
      findUnique: vi.fn(async ({ where }: any) =>
        profiles.get(`${where.companyCode_profitArticleCode.companyCode}:${where.companyCode_profitArticleCode.profitArticleCode}`) ?? null,
      ),
      upsert: vi.fn(async ({ create }: any) => {
        const row = { id: 'prof-1', ...create };
        profiles.set(`${create.companyCode}:${create.profitArticleCode}`, row);
        return row;
      }),
    },
    articleMatchDecision: {
      findUnique: vi.fn(async ({ where }: any) => decisions.get(where.pairKey) ?? null),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: 'dec-1', ...data };
        decisions.set(data.pairKey, row);
        return row;
      }),
    },
    request: {
      findUnique: vi.fn(async () => ({
        id: 'req-1',
        requestedDescription: ' Válvula, admisión ',
        purpose: 'Repuesto motor',
        referencePhotoUri: 'uploads/foto.jpg',
        company: { code: 'ad_trans' },
        requestData: { brandCode: '01', manufacturer: null, partNumber: '7J-178', groupId: 'g1', subgroupId: 's1', unitCode: 'UND', application: 'Motor' },
      })),
    },
  };
  const profitAdapter: any = {
    getArticle: vi.fn(async (code: string) =>
      code === 'FERMIS0662'
        ? { co_art: code, art_des: 'Tornillo, hexagonal.', co_lin: 'FER', co_subl: 'MIS', co_cat: '01', co_color: '01', uni_venta: 'UND', stock_act: 0 }
        : null,
    ),
  };
  const companies: any = { listCompanies: vi.fn(async () => [{ code: 'AD_TRANS' }, { code: 'AD_DIST' }]) };
  const auditoria: any = { logEvent: vi.fn(async (e: any) => { audit.push(e); return e; }) };
  const repository = {
    findProfile: (c: string, p: string) => prisma.articleNormalizationProfile.findUnique({ where: { companyCode_profitArticleCode: { companyCode: c, profitArticleCode: p } } }),
    upsertProfile: (d: any) => prisma.articleNormalizationProfile.upsert({ where: {}, create: d, update: {} }),
    findDecision: (k: string) => prisma.articleMatchDecision.findUnique({ where: { pairKey: k } }),
    createDecision: (d: any) => prisma.articleMatchDecision.create({ data: d }),
    listProfiles: vi.fn(async () => []),
    findDecisionsInvolving: vi.fn(async () => []),
    findRequestLink: vi.fn(async () => null),
  };
  const service = new MatchingService(prisma, profitAdapter, companies, repository as any, auditoria);
  return { service, prisma, profitAdapter, audit };
}

describe('perfil de normalización (preservación)', () => {
  it('original intacta + normalizada separada + versión vigente (v2)', async () => {
    const { service } = buildService();
    const p = await service.getOrCreateProfile('AD_TRANS', 'FERMIS0662');
    expect(p.originalDescription).toBe('Tornillo, hexagonal.');
    expect(p.normalizedDescription).toBe('TORNILLO HEXAGONAL');
    expect(p.originalDescription).not.toBe(p.normalizedDescription);
    expect(p.normalizationVersion).toBe('v2');
    expect(JSON.parse(p.tokensJson)).toEqual(['TORNILLO', 'HEXAGONAL']);
  });

  it('empresa desconocida se rechaza sin leer Profit', async () => {
    const { service, profitAdapter } = buildService();
    await expect(service.getOrCreateProfile('AD_XXX', 'FERMIS0662')).rejects.toThrow();
    expect(profitAdapter.getArticle).not.toHaveBeenCalled();
  });
});

describe('decisiones humanas (pareja canónica + auditoría)', () => {
  it('SAME/DIFFERENT/REVIEW; A-B y B-A no duplican', async () => {
    const { service, audit } = buildService();
    const a = { companyCode: 'AD_TRANS', profitArticleCode: 'FERMIS0662' };
    const b = { companyCode: 'AD_DIST', profitArticleCode: 'FERMIS0662' };
    const d1 = await service.registerDecision(a, b, 'SAME', 'Mismo tornillo', 'u-alm');
    expect(d1.decision).toBe('SAME');
    expect(d1.articleACompany).toBe('AD_DIST');
    const d2 = await service.registerDecision(b, a, 'DIFFERENT', 'otro motivo', 'u-alm');
    expect(d2.id).toBe(d1.id);
    expect(audit.filter((e) => e.action === 'MATCH_DECISION_REGISTERED')).toHaveLength(1);
  });

  it('SAME no crea maestro ni toca Profit (solo registra)', async () => {
    const { service, profitAdapter, prisma } = buildService();
    await service.registerDecision(
      { companyCode: 'AD_TRANS', profitArticleCode: 'X1' },
      { companyCode: 'AD_TRANS', profitArticleCode: 'X2' },
      'SAME', undefined, 'u-alm',
    );
    expect(profitAdapter.getArticle).not.toHaveBeenCalled();
    expect(prisma.articleNormalizationProfile.upsert).not.toHaveBeenCalled();
  });
});

describe('solicitud → input del motor (sin pérdida)', () => {
  it('conserva descripción, propósito, imagen y empresa', async () => {
    const { service } = buildService();
    const input = await service.buildInputFromRequest('req-1');
    expect(input.description).toBe(' Válvula, admisión ');
    expect(input.purpose).toBe('Repuesto motor');
    expect(input.photoReference).toBe('uploads/foto.jpg');
    expect(input.companyCode).toBe('AD_TRANS');
    expect(input.partNumber).toBe('7J-178');
    expect(input.unit).toBe('UND');
  });

  it('findCandidatesForRequest usa el motor v1 (sin SAME automático)', async () => {
    const { service, audit } = buildService();
    const r = await service.findCandidatesForRequest('req-1');
    expect(r.input.description).toContain('Válvula');
    expect(r.candidates).toEqual([]);
    expect(r.engineVersion).toBe('v1');
    expect(audit.filter((e) => e.action === 'MATCH_CANDIDATES_CONSULTED')).toHaveLength(1);
  });
});
