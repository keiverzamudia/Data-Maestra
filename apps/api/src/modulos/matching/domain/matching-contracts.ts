import type { ProfitArticleId } from './article-identity';
import { normalizeText, NORMALIZATION_VERSION } from './text-normalizer';
import { normalizeTextV2, NORMALIZATION_VERSION_V2 } from './text-normalizer';
import { comparableOf } from './feature-extractor';
import type { ExtractedFeatures } from './feature-extractor';

/**
 * FASE 18 — Contratos del futuro motor de coincidencia.
 * Aquí solo contratos + tipos. El algoritmo definitivo llega después;
 * Almacén y la data histórica consumirán estas mismas formas.
 */

/** Entrada conceptual: sirve para una solicitud o un artículo histórico. */
export interface ArticleMatchingInput {
  companyCode: string;
  profitArticleCode?: string;
  description: string;
  purpose?: string;
  photoReference?: string;
  brand?: string;
  model?: string;
  partNumber?: string;
  category?: string;
  subCategory?: string;
  unit?: string;
  application?: string;
}

/** Representación normalizada derivada de un input (sin persistir original). */
export interface NormalizedProfile {
  normalizedDescription: string;
  normalizedPurpose: string;
  normalizedBrand: string;
  normalizedModel: string;
  normalizedPartNumber: string;
  normalizedApplication: string;
  normalizationVersion: string;
}

export type MatchEvidenceKind =
  | 'DESCRIPTION_SIMILARITY'
  | 'BRAND_MATCH'
  | 'MODEL_MATCH'
  | 'PART_NUMBER_MATCH'
  | 'CATEGORY_MATCH'
  | 'SUBCATEGORY_MATCH'
  | 'APPLICATION_MATCH'
  | 'PURPOSE_MATCH'
  | 'PHOTO_SIMILARITY'
  | 'UNIT_MATCH';

export type MatchConflictKind =
  | 'BRAND_CONFLICT'
  | 'MODEL_CONFLICT'
  | 'PART_NUMBER_CONFLICT'
  | 'CATEGORY_CONFLICT'
  | 'UNIT_CONFLICT'
  | 'APPLICATION_CONFLICT';

export type MatchCandidateClassification = 'HIGH' | 'MEDIUM' | 'LOW' | 'REVIEW';

export interface MatchCandidate {
  article: ProfitArticleId;
  confidence: number;
  classification: MatchCandidateClassification;
  evidence: MatchEvidenceKind[];
  conflicts: MatchConflictKind[];
  /** FASE 20 (opcionales, no rompen el contrato FASE 18). */
  score?: number;
  explanation?: string;
  engineVersion?: string;
  priorDecision?: MatchDecisionKind;
}

export type MatchDecisionKind = 'SAME' | 'DIFFERENT' | 'REVIEW';

/** Problemas de clasificación registrables a futuro (contrato documentado). */
export type ClassificationIssueKind =
  | 'CLASSIFICATION_SUSPECT'
  | 'MISSING_DATA'
  | 'CONFLICTING_DATA'
  | 'DUPLICATE_CANDIDATE';

/** Contrato del normalizador (implementación determinística v1 incluida abajo). */
export interface ArticleNormalizer {
  readonly version: string;
  normalize(input: ArticleMatchingInput): NormalizedProfile;
}

/** Contrato del futuro motor. FASE 20 lo implementa (DeterministicMatchEngineV1). */
export interface ArticleMatchEngine {
  findCandidates(input: ArticleMatchingInput): Promise<MatchCandidate[]>;
}

/** Normalizador determinístico v1 (congelado; ver text-normalizer). */
export class DeterministicNormalizerV1 implements ArticleNormalizer {
  readonly version = NORMALIZATION_VERSION;

  normalize(input: ArticleMatchingInput): NormalizedProfile {
    return {
      normalizedDescription: normalizeText(input.description),
      normalizedPurpose: normalizeText(input.purpose),
      normalizedBrand: normalizeText(input.brand),
      normalizedModel: normalizeText(input.model),
      normalizedPartNumber: normalizeText(input.partNumber),
      normalizedApplication: normalizeText(input.application),
      normalizationVersion: this.version,
    };
  }
}

/**
 * FASE 19 — Perfil extendido v2: representación comparable (texto v2 +
 * señales auxiliares). Propósito y aplicación siempre separados.
 */
export interface NormalizedProfileV2 extends NormalizedProfile, ExtractedFeatures {
  normalizedPurpose: string;
  normalizedApplication: string;
  normalizationVersion: 'v2';
}

/** Normalizador determinístico v2 (versión actual; v1 intacta). */
export class DeterministicNormalizerV2 {
  readonly version = NORMALIZATION_VERSION_V2 as 'v2';

  normalize(input: ArticleMatchingInput, knownBrands: string[] = []): NormalizedProfileV2 {
    const rep = comparableOf(input.description, knownBrands);
    const givenPart = normalizeTextV2(input.partNumber);
    const givenModel = normalizeTextV2(input.model);
    // Los datos aportados también alimentan los tokens técnicos para que
    // FASE 20 los compare (sin duplicar, preservando orden de aparición).
    const extraTechnical = [...givenPart.split(' '), ...givenModel.split(' ')]
      .filter((t) => t && (/\d/.test(t) || t.includes('/')));
    const technicalTokens = [...rep.technicalTokens];
    for (const t of extraTechnical) {
      if (!technicalTokens.includes(t)) technicalTokens.push(t);
    }
    return {
      ...rep,
      technicalTokens,
      // El dato aportado manda sobre la detección (sin inventar el ausente).
      partNumberCandidate: givenPart || rep.partNumberCandidate,
      modelCandidate: givenModel || rep.modelCandidate,
      normalizedPurpose: normalizeTextV2(input.purpose),
      normalizedBrand: normalizeTextV2(input.brand),
      normalizedModel: normalizeTextV2(input.model),
      normalizedPartNumber: normalizeTextV2(input.partNumber),
      normalizedApplication: normalizeTextV2(input.application),
      normalizationVersion: this.version,
    };
  }
}
