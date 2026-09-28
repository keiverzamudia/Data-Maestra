import { describe, it, expect, vi } from 'vitest';
import {
  MatchingService,
  REQUEST_PROPOSAL_DECISION,
} from '../src/modulos/matching/application/matching.service';

/**
 * FASE P4 — Propuestas manuales del Analizador ("Agregar a coincidencias").
 *
 * El usuario busca un artículo en Profit y, si cree que puede ser, lo agrega
 * a su carrusel. Reglas a proteger:
 *  1) se puntúa con el MISMO motor del análisis (comparePair): score y
 *     evidencia reales, nunca inventados;
 *  2) el artículo se valida contra el mismo universo que usó la búsqueda;
 *  3) el perfil se asegura con get-or-create idempotente (Profit READ-ONLY);
 *  4) PROPUESTA no es SAME/DIFFERENT: no filtra ni marca candidatos del
 *     análisis y "Es este" la convierte en SAME sin duplicar;
 *  5) nunca pisa una decisión humana ya registrada;
 *  6) retirar borra SOLO la fila PROPUESTA y audita.
 */

const VASO = {
  companyCode: 'AD_TRANS',
  profitArticleCode: 'GENLIM038',
  originalDescription: 'VASOS CONICOS',
  normalizedDescription: 'VASOS CONICOS',
  normalizationVersion: 'v2',
  brand: null, model: null, partNumber: null,
  category: null, subCategory: null, unit: null, application: null,
  featuresJson: JSON.stringify({ technicalTokens: [] }),
};

const FARO = {
  companyCode: 'AD_TRANS',
  profitArticleCode: 'RVHMIS0336',
  originalDescription: 'FARO DERECHO DE CAPOT MACK',
  normalizedDescription: 'FARO DERECHO DE CAPOT MACK',
  normalizationVersion: 'v2',
  brand: null, model: null, partNumber: null,
  category: null, subCategory: null, unit: null, application: null,
  featuresJson: JSON.stringify({ technicalTokens: [] }),
};

function build(opts: {
  profiles?: any[];
  decisions?: any[];
  profitCode?: string | null;
  liveRows?: any[];
  deletedCount?: number;
} = {}) {
  const audit: any[] = [];
  const profiles = opts.profiles ?? [];
  const prisma: any = {
    brand: { findMany: vi.fn(async () => []) },
    request: {
      findUnique: vi.fn(async () => ({
        id: 'req-1',
        status: 'PENDIENTE_ALMACEN',
        requestedDescription: 'vaso',
        purpose: null,
        referencePhotoUri: null,
        company: { code: 'AD_TRANS' },
        requestData: {
          brandCode: null, manufacturer: null, partNumber: null,
          groupId: null, subgroupId: null, unitCode: null, application: null,
          profitCode: opts.profitCode ?? null,
        },
      })),
    },
  };
  const repository: any = {
    listRecallPool: vi.fn(async (companyCode?: string) =>
      profiles.filter((p) => !companyCode || p.companyCode === companyCode)),
    countProfiles: vi.fn(async () => profiles.length),
    searchProfiles: vi.fn(async () => []),
    findProfile: vi.fn(async (company: string, code: string) =>
      profiles.find((p) => p.companyCode === company && p.profitArticleCode === code) ?? null),
    upsertProfile: vi.fn(async (d: any) => ({ id: `p-${d.profitArticleCode}`, ...d })),
    findDecisionsInvolving: vi.fn(async () => []),
    findRequestLink: vi.fn(async () => null),
    upsertRequestLink: vi.fn(async (d: any) => ({ id: 'link-1', ...d })),
    upsertRequestDecision: vi.fn(async (d: any) => ({ id: 'dec-1', ...d })),
    listRequestDecisions: vi.fn(async () => opts.decisions ?? []),
    deleteRequestDecision: vi.fn(async () => ({ count: opts.deletedCount ?? 1 })),
  };
  const profitAdapter: any = {
    getArticle: vi.fn(async (code: string) => {
      const row = (opts.liveRows ?? []).find((r) => r.co_art === code);
      if (!row) return null;
      return {
        co_art: row.co_art, art_des: row.art_des,
        co_lin: null, co_subl: null, co_cat: null, co_color: null,
        uni_venta: null, modelo: null,
      };
    }),
  };
  const companies: any = {
    isListed: vi.fn(async (code: string) => (code === 'AD_TRANS' ? { code } : null)),
    listCompanies: vi.fn(async () => []),
  };
  const auditoria: any = { logEvent: vi.fn(async (e: any) => { audit.push(e); return e; }) };
  const universe: any = { searchArticles: vi.fn(async () => []) };
  const config: any = { get: vi.fn(() => 'AD_TRANS') };
  const service = new MatchingService(
    prisma, profitAdapter, companies, repository, auditoria, universe, config,
  );
  return { service, repository, profitAdapter, audit };
}

const lastAudit = (audit: any[], action: string) =>
  [...audit].reverse().find((e) => e.action === action);

describe('propuesta manual — Agregar a coincidencias (FASE P4)', () => {
  it('propone un artículo del espejo sin tocar Profit y puntúa con el motor', async () => {
    const { service, repository, profitAdapter, audit } = build({ profiles: [VASO] });
    const c = await service.proposeManualCandidate(
      'req-1', 'AD_TRANS', 'GENLIM038', { description: 'vaso' },
      { actorId: 'u1' },
    );

    // El perfil ya existía: ni una lectura extra a Profit.
    expect(profitAdapter.getArticle).not.toHaveBeenCalled();
    expect(repository.upsertRequestDecision).toHaveBeenCalledWith({
      requestId: 'req-1',
      companyCode: 'AD_TRANS',
      profitArticleCode: 'GENLIM038',
      decision: REQUEST_PROPOSAL_DECISION,
      decidedBy: 'u1',
    });
    // Puntaje real del motor (misma similitud que el análisis), no inventado.
    expect(c.manual).toBe(true);
    expect(c.score).toBeGreaterThan(0);
    expect(c.evidence).toContain('DESCRIPTION_SIMILARITY');
    expect(c.description).toBe('VASOS CONICOS');

    const ev = lastAudit(audit, 'MATCH_MANUAL_PROPOSED');
    expect(ev).toBeTruthy();
    const data = JSON.parse(ev.afterData);
    expect(data).toMatchObject({
      companyCode: 'AD_TRANS',
      profitArticleCode: 'GENLIM038',
      score: c.score,
      phase: 'COMPLETA',
    });
  });

  it('hidrata el perfil faltante desde Profit (solo lectura) y lo persiste local', async () => {
    const { service, repository, profitAdapter } = build({
      profiles: [],
      liveRows: [{ co_art: 'RMEMAQ0900', art_des: 'VASO' }],
    });
    const c = await service.proposeManualCandidate(
      'req-1', 'AD_TRANS', 'RMEMAQ0900', { description: 'vaso' },
    );
    expect(profitAdapter.getArticle).toHaveBeenCalledTimes(1);
    expect(profitAdapter.getArticle).toHaveBeenCalledWith('RMEMAQ0900');
    expect(repository.upsertProfile).toHaveBeenCalledTimes(1);
    expect(repository.upsertRequestDecision).toHaveBeenCalledTimes(1);
    expect(c.manual).toBe(true);
    expect(c.score).toBeGreaterThan(0);
  });

  it('artículo inexistente en Profit responde 404 en español y no propone', async () => {
    const { service, repository } = build({ profiles: [], liveRows: [] });
    await expect(
      service.proposeManualCandidate('req-1', 'AD_TRANS', 'NOEXISTE', { description: 'vaso' }),
    ).rejects.toThrow(/Artículo AD_TRANS:NOEXISTE no encontrado en Profit/);
    expect(repository.upsertRequestDecision).not.toHaveBeenCalled();
  });

  it('rechaza artículos fuera del universo de la solicitud', async () => {
    const { service, profitAdapter, repository } = build({ profiles: [VASO] });
    await expect(
      service.proposeManualCandidate('req-1', 'OTRA_EMP', 'GENLIM038', { description: 'vaso' }),
    ).rejects.toThrow(/fuera del universo de esta solicitud \(AD_TRANS\)/);
    expect(profitAdapter.getArticle).not.toHaveBeenCalled();
    expect(repository.upsertRequestDecision).not.toHaveBeenCalled();
  });

  it('no degrada una decisión registrada: SAME existente rechaza la propuesta', async () => {
    const { service, repository } = build({
      profiles: [VASO],
      decisions: [{
        requestId: 'req-1', companyCode: 'AD_TRANS', profitArticleCode: 'GENLIM038',
        decision: 'SAME', decidedAt: new Date(),
      }],
    });
    await expect(
      service.proposeManualCandidate('req-1', 'AD_TRANS', 'GENLIM038', { description: 'vaso' }),
    ).rejects.toThrow(/ya tiene una decisión registrada/);
    expect(repository.upsertRequestDecision).not.toHaveBeenCalled();
  });

  it('repetir la propuesta es idempotente (misma tripleta, sin duplicar)', async () => {
    const { service, repository } = build({ profiles: [VASO] });
    const first = await service.proposeManualCandidate('req-1', 'AD_TRANS', 'GENLIM038', { description: 'vaso' });
    const second = await service.proposeManualCandidate('req-1', 'AD_TRANS', 'GENLIM038', { description: 'vaso' });
    expect(repository.upsertRequestDecision).toHaveBeenCalledTimes(2);
    // Upsert sobre la misma tripleta: la segunda no crea una fila distinta.
    for (const call of repository.upsertRequestDecision.mock.calls) {
      expect(call[0]).toMatchObject({
        requestId: 'req-1',
        companyCode: 'AD_TRANS',
        profitArticleCode: 'GENLIM038',
        decision: REQUEST_PROPOSAL_DECISION,
      });
    }
    expect(first.score).toBe(second.score);
  });

  it('no deja proponer el propio artículo de la solicitud', async () => {
    const { service } = build({ profiles: [VASO], profitCode: 'GENLIM038' });
    await expect(
      service.proposeManualCandidate('req-1', 'AD_TRANS', 'GENLIM038', { description: 'vaso' }),
    ).rejects.toThrow(/propio artículo de la solicitud/);
  });

  it('listManualProposals devuelve las propuestas puntuadas con el motor', async () => {
    const { service, repository } = build({
      profiles: [VASO, FARO],
      decisions: [{
        requestId: 'req-1', companyCode: 'AD_TRANS', profitArticleCode: 'GENLIM038',
        decision: REQUEST_PROPOSAL_DECISION, decidedAt: new Date(),
      }],
    });
    const r = await service.listManualProposals('req-1', { description: 'vaso' });
    expect(r.candidates).toHaveLength(1);
    const c = r.candidates[0]!;
    expect(c.article.profitArticleCode).toBe('GENLIM038');
    expect(c.manual).toBe(true);
    expect(c.score).toBeGreaterThan(0);
    expect(c.description).toBe('VASOS CONICOS');
    // Solo lectura: la lista no decide, no vincula y no escribe.
    expect(repository.upsertRequestDecision).not.toHaveBeenCalled();
    expect(repository.upsertRequestLink).not.toHaveBeenCalled();
  });

  it('sin propuestas no consulta perfiles ni devuelve ruido', async () => {
    const { service, repository } = build({ profiles: [VASO] });
    const r = await service.listManualProposals('req-1', { description: 'vaso' });
    expect(r.candidates).toEqual([]);
    expect(repository.findProfile).not.toHaveBeenCalled();
  });

  it('la propuesta no contamina el análisis (no filtra ni marca candidatos)', async () => {
    const { service, audit } = build({
      profiles: [VASO, FARO],
      decisions: [{
        requestId: 'req-1', companyCode: 'AD_TRANS', profitArticleCode: 'GENLIM038',
        decision: REQUEST_PROPOSAL_DECISION, decidedAt: new Date(),
      }],
    });
    const r = await service.analyzeDraft('req-1', { description: 'vaso' });
    const codes = r.candidates.map((c) => c.article.profitArticleCode);
    expect(codes).toContain('GENLIM038');
    // Ni exclusión (eso es solo de DIFFERENT) ni marca previa (solo SAME).
    expect(codes).not.toContain('RVHMIS0336'); // sin evidencia → filtrado
    const c = r.candidates.find((x) => x.article.profitArticleCode === 'GENLIM038')!;
    expect(c.priorDecision).toBeUndefined();
    const data = JSON.parse(lastAudit(audit, 'MATCH_CANDIDATES_CONSULTED').afterData);
    // El FARO nunca llegó a puntuar: lo frenó la puerta (como en el spec de
    // recall), y la PROPUESTA no lo convirtió en exclusión ni en marca.
    expect(data.filteredNoEvidence).toBe(0);
  });

  it('retirar propuesta borra SOLO la fila PROPUESTA y audita', async () => {
    const { service, repository, audit } = build({ deletedCount: 1 });
    const r = await service.unproposeManualCandidate('req-1', ' ad_trans ', ' GENLIM038 ', 'u1');
    expect(r.removed).toBe(1);
    expect(repository.deleteRequestDecision).toHaveBeenCalledWith({
      requestId: 'req-1',
      companyCode: 'AD_TRANS',
      profitArticleCode: 'GENLIM038',
      decision: REQUEST_PROPOSAL_DECISION,
    });
    expect(lastAudit(audit, 'MATCH_MANUAL_UNPROPOSED')).toBeTruthy();
  });

  it('retirar sin propuesta vigente es idempotente y no audita', async () => {
    const { service, audit } = build({ deletedCount: 0 });
    const r = await service.unproposeManualCandidate('req-1', 'AD_TRANS', 'GENLIM038', 'u1');
    expect(r.removed).toBe(0);
    expect(lastAudit(audit, 'MATCH_MANUAL_UNPROPOSED')).toBeUndefined();
  });
});
