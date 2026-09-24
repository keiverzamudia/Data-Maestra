import { api } from './api-client';

/**
 * FASE 18 — Cliente del dominio matching (fundación del futuro motor).
 * FASE 20 — suma consulta de candidatos (asistencia, no decide).
 * Solo tipos + llamadas. Sin UI de comprador todavía (FASE 21).
 */

export type MatchCandidateClassification = 'HIGH' | 'MEDIUM' | 'LOW' | 'REVIEW';

export interface ProfitArticleRef {
  companyCode: string;
  profitArticleCode: string;
}

export interface NormalizeInput {
  description: string;
  purpose?: string;
  brand?: string;
  model?: string;
  partNumber?: string;
  category?: string;
  subCategory?: string;
  unit?: string;
  application?: string;
}

export interface NormalizedProfileResult {
  normalizedDescription: string;
  normalizedPurpose: string;
  normalizedBrand: string;
  normalizedModel: string;
  normalizedPartNumber: string;
  normalizedApplication: string;
  normalizationVersion: string;
  tokens?: string[];
  technicalTokens?: string[];
  unitCanonical?: string | null;
  modelCandidate?: string | null;
  partNumberCandidate?: string | null;
  brandCandidate?: string | null;
}

export interface NormalizationProfile extends ProfitArticleRef {
  id: string;
  originalDescription: string;
  normalizedDescription: string;
  normalizationVersion: string;
}

export type MatchDecisionKind = 'SAME' | 'DIFFERENT' | 'REVIEW';

export interface MatchDecision extends ProfitArticleRef {
  id: string;
  articleACompany: string;
  articleAProfitCode: string;
  articleBCompany: string;
  articleBProfitCode: string;
  pairKey: string;
  decision: MatchDecisionKind;
  reason?: string | null;
}

export const apiMatchingService = {
  async normalize(input: NormalizeInput): Promise<NormalizedProfileResult> {
    return api.post<NormalizedProfileResult>('/api/v1/matching/normalizar', input);
  },

  async perfil(companyCode: string, profitArticleCode: string): Promise<NormalizationProfile> {
    return api.post<NormalizationProfile>('/api/v1/matching/perfiles', { companyCode, profitArticleCode });
  },

  async renormalizar(companyCode: string, profitArticleCode: string): Promise<NormalizationProfile> {
    return api.post<NormalizationProfile>('/api/v1/matching/renormalizar', { companyCode, profitArticleCode });
  },

  async decision(
    a: ProfitArticleRef,
    b: ProfitArticleRef,
    decision: MatchDecisionKind,
    reason?: string,
  ): Promise<MatchDecision> {
    return api.post<MatchDecision>('/api/v1/matching/decisiones', {
      articleACompany: a.companyCode,
      articleAProfitCode: a.profitArticleCode,
      articleBCompany: b.companyCode,
      articleBProfitCode: b.profitArticleCode,
      decision,
      reason,
    });
  },

  async candidatos(requestId: string, companyCode?: string): Promise<CandidatesResult> {
    return api.post<CandidatesResult>('/api/v1/matching/candidatos', { requestId, companyCode });
  },

  /**
   * FASE P2 — `phase` gobierna la búsqueda en dos tiempos:
   * INICIAL (automática, solo descripción) / COMPLETA (botón
   * "Validar artículo", todos los campos). Si no se envía, el backend
   * interpreta COMPLETA.
   */
  async analizar(
    requestId: string,
    draft: AnalyzerDraft,
    opts?: { limit?: number; companyCode?: string; phase?: AnalyzerPhase },
  ): Promise<AnalyzerResult> {
    return api.post<AnalyzerResult>('/api/v1/matching/analizar', {
      requestId,
      ...draft,
      phase: opts?.phase,
      limit: opts?.limit,
      companyCode: opts?.companyCode,
    });
  },

  async vincular(
    requestId: string,
    article: ProfitArticleRef,
    decision: 'SAME' | 'DIFFERENT',
  ): Promise<{ id: string; decision: string }> {
    return api.post(`/api/v1/matching/solicitudes/${encodeURIComponent(requestId)}/vincular`, {
      companyCode: article.companyCode,
      profitArticleCode: article.profitArticleCode,
      decision,
    });
  },

  /**
   * FASE P3 — Búsqueda manual de un artículo en Profit.
   * El backend busca primero en el universo local y, si no lo encuentra,
   * consulta Profit en vivo. Solo consulta: no modifica el análisis.
   */
  async buscarArticulo(
    requestId: string,
    term: string,
    limit?: number,
  ): Promise<ProfitSearchResult> {
    return api.post<ProfitSearchResult>('/api/v1/matching/buscar', { requestId, term, limit });
  },
};

export interface EngineCandidate {
  article: ProfitArticleRef;
  description?: string;
  detail?: CandidateDetail;
  confidence: number;
  classification: MatchCandidateClassification;
  evidence: string[];
  conflicts: string[];
  score?: number;
  explanation?: string;
  engineVersion?: string;
  priorDecision?: MatchDecisionKind;
}

export interface CandidateDetail {
  originalDescription?: string;
  normalizedDescription?: string;
  brand?: string;
  model?: string;
  partNumber?: string;
  category?: string;
  subCategory?: string;
  unit?: string;
  application?: string;
  /** FASE 23.2 — referencia fotográfica del artículo existente ( Profit
   * imagen1/imagen2 ); ausente cuando AD_TRANS no trae foto. */
  photo?: string;
}

export interface CandidatesResult {
  input: Record<string, unknown>;
  candidates: EngineCandidate[];
  engineVersion: string;
}

/**
 * FASE 23.1 — Borrador del formulario de Almacén (datos aún no guardados).
 * `model` se sumó en FASE P1: el formulario de Almacén lo recoge desde la
 * FASE 24.2 pero hasta ahora se perdía antes de llegar al motor.
 */
export interface AnalyzerDraft {
  description?: string;
  purpose?: string;
  groupCode?: string;
  subgroupCode?: string;
  categoryCode?: string;
  brandCode?: string;
  unitCode?: string;
  taxType?: string;
  model?: string;
  partNumber?: string;
  application?: string;
}

/**
 * FASE P1 — trazabilidad del universo consultado. `poolTruncated=true`
 * significa que el tope de perfiles silenció parte del universo de la empresa
 * (la UI lo avisa; el resultado sigue siendo el mismo análisis).
 */
/** FASE P2 — fase de la búsqueda (eco de lo que el backend ejecutó). */
export type AnalyzerPhase = 'INICIAL' | 'COMPLETA';

export interface AnalyzerResult {
  input: Record<string, unknown>;
  candidates: EngineCandidate[];
  insufficient: boolean;
  engineVersion: string;
  /** FASE P2 — qué fase produjo estos resultados (INICIAL = solo descripción). */
  phase?: AnalyzerPhase;
  poolTotal?: number | null;
  poolLimit?: number;
  poolTruncated?: boolean;
}

/** FASE P3 — origen de los resultados de la búsqueda manual. */
export type ProfitSearchSource = 'LOCAL' | 'PROFIT';

/** FASE P3 — coincidencia devuelta por la búsqueda manual. */
export interface ProfitSearchHit {
  companyCode: string;
  profitArticleCode: string;
  description: string;
  brand?: string;
  model?: string;
}

/** FASE P3 — resultado de la búsqueda manual de un artículo en Profit. */
export interface ProfitSearchResult {
  companyCode: string;
  term: string;
  source: ProfitSearchSource;
  results: ProfitSearchHit[];
}
