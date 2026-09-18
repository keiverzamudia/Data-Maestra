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

  async analizar(requestId: string, draft: AnalyzerDraft, opts?: { limit?: number; companyCode?: string }): Promise<AnalyzerResult> {
    return api.post<AnalyzerResult>('/api/v1/matching/analizar', {
      requestId,
      ...draft,
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

/** FASE 23.1 — Borrador del formulario de Almacén (datos aún no guardados). */
export interface AnalyzerDraft {
  description?: string;
  purpose?: string;
  groupCode?: string;
  subgroupCode?: string;
  categoryCode?: string;
  brandCode?: string;
  unitCode?: string;
  taxType?: string;
  partNumber?: string;
  application?: string;
}

export interface AnalyzerResult {
  input: Record<string, unknown>;
  candidates: EngineCandidate[];
  insufficient: boolean;
  engineVersion: string;
}

/** FASE 23.1 — Borrador del formulario de Almacén (datos aún no guardados). */
export interface AnalyzerDraft {
  description?: string;
  purpose?: string;
  groupCode?: string;
  subgroupCode?: string;
  categoryCode?: string;
  brandCode?: string;
  unitCode?: string;
  taxType?: string;
  partNumber?: string;
  application?: string;
}

export interface AnalyzerResult {
  input: Record<string, unknown>;
  candidates: EngineCandidate[];
  insufficient: boolean;
  engineVersion: string;
}
