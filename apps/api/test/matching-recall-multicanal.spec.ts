import { describe, it, expect, vi } from 'vitest';
import { MatchingService } from '../src/modulos/matching/application/matching.service';
import { tokensOverlapTolerant } from '../src/modulos/matching/domain/search-tokens';

/**
 * Recall multicanal del Analizador.
 *
 * Regresión real: la solicitud "vaso" mostraba `FARO DERECHO DE CAPOT…
 * 0/100` mientras en Profit existen VASO / JUEGO DE VASOS / VASOS CONICOS.
 * Causa: el análisis puntuaba solo los primeros 500 perfiles por orden de
 * código (lote arbitrario, sin relación con la consulta).
 *
 * Reglas a proteger:
 *  1) el recall cubre el universo local completo (listRecallPool, sin
 *     corte por código) y nunca usa listProfiles para analizar;
 *  2) "vaso" encuentra VASOS por canal LIKE y por solape tolerante;
 *  3) lo sin evidencia no entra (adiós relleno 0/100);
 *  4) respaldo en vivo solo cuando el local cubre poco (Profit intacto);
 *  5) caché TTL evita repetir el recall; vincular lo invalida.
 */

const VASO_ROWS = [
  { code: 'GENLIM041', desc: 'DISPENSADOR VASOS CONICOS' },
  { code: 'FERMIS0576', desc: 'JUEGO DE VASOS' },
  { code: 'RMEMAQ0900', desc: 'VASO' },
  { code: 'GENLIM038', desc: 'VASOS CONICOS' },
];

const FARO = {
  companyCode: 'AD_TRANS',
  profitArticleCode: 'RVHMIS0336',
  originalDescription: 'FARO DERECHO DE CAPOT MACK GRANITE TIBURON MP8B',
  normalizedDescription: 'FARO DERECHO DE CAPOT MACK GRANITE TIBURON MP8B',
  normalizationVersion: 'v2',
  brand: null, model: null, partNumber: null,
  category: null, subCategory: null, unit: null, application: null,
  featuresJson: JSON.stringify({ technicalTokens: [] }),
};

const vasoProf = (code: string, desc: string) => ({
  companyCode: 'AD_TRANS',
  profitArticleCode: code,
  originalDescription: desc,
  normalizedDescription: desc,
  normalizationVersion: 'v2',
  brand: null, model: null, partNumber: null,
  category: null, subCategory: null, unit: null, application: null,
  featuresJson: JSON.stringify({ technicalTokens: [] }),
});

/** Imita al LIKE por palabras de producción: todos los tokens, subcadena. */
function likeLocal(profiles: any[]) {
  return vi.fn(async (company: string, term: string, limit: number) => {
    const toks = term.toUpperCase().split(/[^A-Z0-9Ñ]+/u).filter((t) => t.length >= 2);
    return profiles
      .filter((p) => p.companyCode === company)
      .filter((p) => toks.every((t) =>
        p.profitArticleCode.includes(t) || p.originalDescription.includes(t)))
      .slice(0, limit);
  });
}

function build(opts: {
  profiles?: any[];
  liveRows?: any[];
  likeFn?: any;
  description?: string;
}) {
  const audit: any[] = [];
  const profiles = opts.profiles ?? [];
  const prisma: any = {
    brand: { findMany: vi.fn(async () => []) },
    request: {
      findUnique: vi.fn(async () => ({
        id: 'req-vaso',
        status: 'PENDIENTE_ALMACEN',
        requestedDescription: opts.description ?? 'vaso',
        purpose: null,
        referencePhotoUri: null,
        company: { code: 'AD_TRANS' },
        requestData: {
          brandCode: null, manufacturer: null, partNumber: null,
          groupId: null, subgroupId: null, unitCode: null, application: null,
          profitCode: null,
        },
      })),
    },
  };
  const repository: any = {
    listRecallPool: vi.fn(async (companyCode?: string) =>
      profiles.filter((p) => !companyCode || p.companyCode === companyCode)),
    listProfiles: vi.fn(async () => { throw new Error('listProfiles ya no analiza'); }),
    countProfiles: vi.fn(async (companyCode?: string) =>
      profiles.filter((p) => !companyCode || p.companyCode === companyCode).length),
    searchProfiles: opts.likeFn === undefined ? likeLocal(profiles) : opts.likeFn,
    findProfile: vi.fn(async () => null),
    upsertProfile: vi.fn(async (d: any) => ({ id: `p-${d.profitArticleCode}`, ...d })),
    findDecisionsInvolving: vi.fn(async () => []),
    findRequestLink: vi.fn(async () => null),
    upsertRequestLink: vi.fn(async (d: any) => ({ id: 'link-1', ...d })),
    upsertRequestDecision: vi.fn(async (d: any) => ({ id: 'dec-1', ...d })),
    listRequestDecisions: vi.fn(async () => []),
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
  const universe: any = { searchArticles: vi.fn(async () => opts.liveRows ?? []) };
  const config: any = { get: vi.fn(() => 'AD_TRANS') };
  const service = new MatchingService(
    prisma, profitAdapter, companies, repository, auditoria, universe, config,
  );
  return { service, repository, universe, profitAdapter, audit };
}

const lastAudit = (audit: any[], action: string) =>
  [...audit].reverse().find((e) => e.action === action);

describe('recall multicanal — caso real "vaso"', () => {
  it('"vaso" encuentra VASOS con puntaje real y excluye el FARO sin evidencia', async () => {
    const { service, repository, audit } = build({
      profiles: [FARO, ...VASO_ROWS.map((r) => vasoProf(r.code, r.desc))],
    });
    const r = await service.analyzeDraft('req-vaso', { description: 'vaso' });

    expect(repository.listProfiles).not.toHaveBeenCalled();
    expect(repository.listRecallPool).toHaveBeenCalledWith('AD_TRANS');
    const codes = r.candidates.map((c) => c.article.profitArticleCode);
    for (const v of VASO_ROWS) expect(codes).toContain(v.code);
    expect(codes).not.toContain('RVHMIS0336');
    expect(r.insufficient).toBe(false);
    // El bug original: entraban por una puerta y el scoring les ponía
    // 0/100 (orden alfabético, relleno). Ahora puntúan con evidencia.
    expect(r.candidates.length).toBeGreaterThanOrEqual(VASO_ROWS.length);
    for (const c of r.candidates) {
      expect(c.score).toBeGreaterThan(0);
      expect(c.evidence).toContain('DESCRIPTION_SIMILARITY');
    }

    const data = JSON.parse(lastAudit(audit, 'MATCH_CANDIDATES_CONSULTED').afterData);
    expect(data.recallSource).toBe('LOCAL');
    expect(data.poolScanned).toBe(5);
    expect(data.filteredNoEvidence).toBe(0);
  });

  it('ruido calibrado: PASO no se cuela en "vaso" (edición prohibida en 4 letras)', async () => {
    const { service, audit } = build({
      profiles: [
        FARO,
        vasoProf('ELECAJ0002', 'CAJA DE PASO 1/2 PVC'),
        vasoProf('FERCON0004', 'LLAVE DE PASO 3/4'),
      ],
      likeFn: vi.fn(async () => []),
    });
    const r = await service.analyzeDraft('req-vaso', { description: 'vaso' });
    expect(r.candidates).toEqual([]);
    expect(r.insufficient).toBe(false);
    // filteredNoEvidence = 0 → ni siquiera entraron al scoring: la
    // puerta (la MISMA regla del scoring) es la que los frenó.
    const data = JSON.parse(lastAudit(audit, 'MATCH_CANDIDATES_CONSULTED').afterData);
    expect(data.count).toBe(0);
    expect(data.filteredNoEvidence).toBe(0);
  });

  it('puerta engañosa (LIKE): entra pero sin evidencia → se filtra y queda trazado', async () => {
    const { service, audit } = build({
      profiles: [FARO],
      // Falso positivo del canal literal: el espejo lo marcó, pero el
      // scoring no demuestra ninguna relación → no se lista (y la
      // auditoría lo cuenta, nada desaparece en silencio).
      likeFn: vi.fn(async () => [FARO]),
    });
    const r = await service.analyzeDraft('req-vaso', { description: 'vaso' });
    expect(r.candidates).toEqual([]);
    expect(r.insufficient).toBe(false);
    const data = JSON.parse(lastAudit(audit, 'MATCH_CANDIDATES_CONSULTED').afterData);
    expect(data.count).toBe(0);
    expect(data.filteredNoEvidence).toBe(1);
  });

  it('canal tolerante: VASO ve VASOS aunque el LIKE local no marque', async () => {
    const { service, universe } = build({
      profiles: VASO_ROWS.slice(0, 3).map((r) => vasoProf(r.code, r.desc)),
      likeFn: vi.fn(async () => []),
    });
    const r = await service.analyzeDraft('req-vaso', { description: 'vaso' });
    const codes = r.candidates.map((c) => c.article.profitArticleCode);
    expect(codes).toContain('FERMIS0576');
    expect(codes).toContain('RMEMAQ0900');
    // Cobertura suficiente desde el espejo: Profit en vivo ni se toca.
    expect(universe.searchArticles).not.toHaveBeenCalled();
  });

  it('sin evidencia no hay relleno: universo ajeno → lista vacía honesta', async () => {
    const { service } = build({ profiles: [FARO], likeFn: vi.fn(async () => []) });
    const r = await service.analyzeDraft('req-vaso', { description: 'vaso' });
    // El backfill en vivo no trae nada (liveRows vacío) → sin candidatos.
    expect(r.candidates).toEqual([]);
    expect(r.insufficient).toBe(false);
  });

  it('backfill en vivo solo cuando el local cubre poco (hidratación acotada)', async () => {
    const liveRows = [{ co_art: 'GENLIM041', art_des: 'DISPENSADOR VASOS CONICOS' }];
    const { service, universe, profitAdapter, audit } = build({
      profiles: [FARO],
      liveRows,
      likeFn: vi.fn(async () => []),
    });
    const r = await service.analyzeDraft('req-vaso', { description: 'vaso' });

    expect(universe.searchArticles).toHaveBeenCalledWith('AD_TRANS', 'vaso', 50);
    expect(profitAdapter.getArticle).toHaveBeenCalledWith('GENLIM041');
    const codes = r.candidates.map((c) => c.article.profitArticleCode);
    expect(codes).toContain('GENLIM041');
    expect(codes).not.toContain('RVHMIS0336');
    const data = JSON.parse(lastAudit(audit, 'MATCH_CANDIDATES_CONSULTED').afterData);
    expect(['LOCAL+PROFIT', 'PROFIT']).toContain(data.recallSource);
  });

  it('caché TTL: el mismo análisis no repite el recall; vincular lo invalida', async () => {
    const { service, repository, profitAdapter } = build({
      profiles: [FARO, ...VASO_ROWS.map((r) => vasoProf(r.code, r.desc))],
    });
    await service.analyzeDraft('req-vaso', { description: 'vaso' });
    await service.analyzeDraft('req-vaso', { description: 'vaso' });
    expect(repository.listRecallPool).toHaveBeenCalledTimes(1);

    profitAdapter.getArticle.mockResolvedValue({
      co_art: 'GENLIM041', art_des: 'DISPENSADOR VASOS CONICOS',
      co_lin: null, co_subl: null, co_cat: null, co_color: null,
      uni_venta: null, modelo: null,
    });
    await service.linkRequestToExisting('req-vaso', 'AD_TRANS', 'GENLIM041', 'SAME', 'u-1');
    await service.analyzeDraft('req-vaso', { description: 'vaso' });
    expect(repository.listRecallPool).toHaveBeenCalledTimes(2);
  });
});

describe('tokensOverlapTolerant — solape del motor, no literal', () => {
  it('igualdad, subcadena y prefijo', () => {
    expect(tokensOverlapTolerant('VASO', 'VASO')).toBe(true);
    expect(tokensOverlapTolerant('VASO', 'VASOS')).toBe(true);
    expect(tokensOverlapTolerant('VASOS', 'VASO')).toBe(true);
    expect(tokensOverlapTolerant('HEX', 'HEXAGONAL')).toBe(true);
  });
  it('typos leves en tokens largos', () => {
    expect(tokensOverlapTolerant('TORNILLO', 'TORNILO')).toBe(true);
    expect(tokensOverlapTolerant('TORNILLO', 'FARO')).toBe(false);
  });
  it('edición PROHIBIDA en 4–5 letras: VASO no es PASO', () => {
    expect(tokensOverlapTolerant('VASO', 'PASO')).toBe(false);
    expect(tokensOverlapTolerant('PASO', 'CASO')).toBe(false);
    expect(tokensOverlapTolerant('VASO', 'VAGO')).toBe(false);
    expect(tokensOverlapTolerant('FARO', 'FAROS')).toBe(true); // subcadena sí
  });
  it('edición acotada solo en tokens largos (≥6)', () => {
    expect(tokensOverlapTolerant('CARCASA', 'CARGASA')).toBe(true); // 1 ed., prefijo CAR<4
    expect(tokensOverlapTolerant('CARCA', 'GARGA')).toBe(false); // 5 letras: sin edición
  });
  it('tokens cortos solo por igualdad exacta', () => {
    expect(tokensOverlapTolerant('DE', 'DEL')).toBe(false);
    expect(tokensOverlapTolerant('DE', 'DE')).toBe(true);
  });
});
