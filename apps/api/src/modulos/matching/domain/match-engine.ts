import { normalizeTextV2 } from './text-normalizer';
import { UNIT_CANONICAL } from './feature-extractor';
import type {
  ArticleMatchingInput,
  ArticleMatchEngine,
  MatchCandidate,
  MatchCandidateClassification,
  MatchConflictKind,
  MatchEvidenceKind,
} from './matching-contracts';
import type { ProfitArticleId } from './article-identity';

/**
 * FASE 20 — Motor determinístico de coincidencia v1.
 *
 * Encuentra candidatos + explica por qué + permite decisión humana. NUNCA
 * declara SAME: la clasificación máxima con evidencia perfecta es HIGH
 * (asistencia, no verdad). Sin IA, sin azar, sin servicios externos.
 *
 * Estrategia de importancia (documentada, no arbitraria):
 * - identificadores técnicos (número de parte 40, modelo 25): deciden fuerte;
 * - características específicas (marca 15, categoría 8, subcategoría 6);
 * - texto (descripción Jaccard × 20, tope 20);
 * - contexto (unidad canónica 5, aplicación 5, propósito 5).
 * Score máximo nominal 100 (topeado). Umbrales: ≥65 HIGH, ≥35 MEDIUM,
 * ≥12 LOW, menor → REVIEW. El score NUNCA decide solo (§16): cualquier
 * conflicto presente limita la clasificación a REVIEW.
 */

/** Versión del motor (trazabilidad v1 → v2 futura). */
export const ENGINE_VERSION = 'v1';

/** Artículo disponible para comparar (perfil local o lectura Profit). */
export interface ArticleSnapshot {
  article: ProfitArticleId;
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

/** Fuente de candidatos (el motor no conoce persistencia). */
export interface CandidateProvider {
  listCandidates(input: ArticleMatchingInput): Promise<ArticleSnapshot[]>;
}

interface SignalComparison {
  evidence: MatchEvidenceKind[];
  conflicts: MatchConflictKind[];
  score: number;
}

const clean = (v: unknown): string => String(v ?? '').trim();

function equals(a: unknown, b: unknown): boolean {
  const x = clean(a);
  const y = clean(b);
  return x !== '' && x === y;
}

function bothPresent(a: unknown, b: unknown): boolean {
  return clean(a) !== '' && clean(b) !== '';
}

function tokenSet(text: string): Set<string> {
  const t = normalizeTextV2(text);
  return new Set(t ? t.split(' ') : []);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter += 1;
  }
  return inter / (a.size + b.size - inter);
}

function canonicalUnit(v: unknown): string {
  const t = normalizeTextV2(String(v ?? '')).split(' ').filter(Boolean);
  for (const tok of t) {
    const c = UNIT_CANONICAL[tok];
    if (c) return c;
  }
  return t.join(' ');
}

function compareSignals(input: ArticleMatchingInput, snap: ArticleSnapshot): SignalComparison {
  const evidence: MatchEvidenceKind[] = [];
  const conflicts: MatchConflictKind[] = [];
  let score = 0;

  if (bothPresent(input.partNumber, snap.partNumber)) {
    if (equals(input.partNumber, snap.partNumber)) {
      evidence.push('PART_NUMBER_MATCH');
      score += 40;
    } else {
      conflicts.push('PART_NUMBER_CONFLICT');
    }
  }
  if (bothPresent(input.model, snap.model)) {
    if (equals(input.model, snap.model)) {
      evidence.push('MODEL_MATCH');
      score += 25;
    } else {
      conflicts.push('MODEL_CONFLICT');
    }
  }
  if (bothPresent(input.brand, snap.brand)) {
    if (equals(input.brand, snap.brand)) {
      evidence.push('BRAND_MATCH');
      score += 15;
    } else {
      conflicts.push('BRAND_CONFLICT');
    }
  }
  if (bothPresent(input.category, snap.category)) {
    if (equals(input.category, snap.category)) {
      evidence.push('CATEGORY_MATCH');
      score += 8;
    } else {
      conflicts.push('CATEGORY_CONFLICT');
    }
  }
  if (bothPresent(input.subCategory, snap.subCategory) && equals(input.subCategory, snap.subCategory)) {
    evidence.push('SUBCATEGORY_MATCH');
    score += 6;
  }
  if (bothPresent(input.unit, snap.unit)) {
    const a = canonicalUnit(input.unit);
    const b = canonicalUnit(snap.unit);
    if (a !== '' && a === b) {
      evidence.push('UNIT_MATCH');
      score += 5;
    } else {
      conflicts.push('UNIT_CONFLICT');
    }
  }
  if (bothPresent(input.application, snap.application)) {
    if (equals(input.application, snap.application)) {
      evidence.push('APPLICATION_MATCH');
      score += 5;
    } else {
      conflicts.push('APPLICATION_CONFLICT');
    }
  }
  if (bothPresent(input.purpose, snap.purpose) && equals(input.purpose, snap.purpose)) {
    evidence.push('PURPOSE_MATCH');
    score += 5;
  }

  const sim = jaccard(tokenSet(input.description), tokenSet(snap.description));
  if (sim >= 0.5) {
    evidence.push('DESCRIPTION_SIMILARITY');
    score += Math.round(sim * 20);
  }

  return { evidence, conflicts, score: Math.min(100, score) };
}

function classify(score: number, conflicts: MatchConflictKind[], hasDescription: boolean): MatchCandidateClassification {
  if (!hasDescription) return 'REVIEW';
  if (conflicts.length > 0) return 'REVIEW';
  if (score >= 65) return 'HIGH';
  if (score >= 35) return 'MEDIUM';
  if (score >= 12) return 'LOW';
  return 'REVIEW';
}

const EVIDENCE_ES: Record<MatchEvidenceKind, string> = {
  DESCRIPTION_SIMILARITY: 'la descripción es similar',
  BRAND_MATCH: 'la marca coincide',
  MODEL_MATCH: 'el modelo coincide',
  PART_NUMBER_MATCH: 'el número de parte coincide',
  CATEGORY_MATCH: 'la categoría coincide',
  SUBCATEGORY_MATCH: 'la subcategoría coincide',
  APPLICATION_MATCH: 'la aplicación es compatible',
  PURPOSE_MATCH: 'el propósito es compatible',
  PHOTO_SIMILARITY: 'la imagen es similar',
  UNIT_MATCH: 'la unidad es compatible',
};

const CONFLICT_ES: Record<MatchConflictKind, string> = {
  BRAND_CONFLICT: 'la marca difiere',
  MODEL_CONFLICT: 'el modelo difiere',
  PART_NUMBER_CONFLICT: 'el número de parte difiere',
  CATEGORY_CONFLICT: 'la categoría difiere',
  UNIT_CONFLICT: 'la unidad difiere',
  APPLICATION_CONFLICT: 'la aplicación difiere',
};

/** Explicación humana en español (la técnica queda en evidence/conflicts). */
export function explainCandidate(
  evidence: MatchEvidenceKind[],
  conflicts: MatchConflictKind[],
  missing: string[],
): string {
  const parts: string[] = [];
  if (evidence.length > 0) {
    parts.push(`Se muestra porque ${evidence.map((e) => EVIDENCE_ES[e]).join(', ')}.`);
  } else {
    parts.push('Se muestra por relación textual débil; conviene revisar con cuidado.');
  }
  if (conflicts.length > 0) {
    parts.push(`Requiere revisión porque ${conflicts.map((c) => CONFLICT_ES[c]).join(', ')}.`);
  }
  if (missing.length > 0) {
    parts.push(`No se pudo confirmar: ${missing.join(', ')}.`);
  }
  return parts.join(' ');
}

export interface EngineCandidate extends MatchCandidate {
  score: number;
  explanation: string;
  engineVersion: string;
}

/**
 * FASE 23.1 — Datos del perfil para el detalle del Analizador. Solo datos
 * realmente almacenados; nada inventado. Sin foto: Profit no la provee.
 */
export interface CandidateDetail {
  originalDescription: string;
  normalizedDescription: string;
  brand?: string;
  model?: string;
  partNumber?: string;
  category?: string;
  subCategory?: string;
  unit?: string;
  application?: string;
}

/** Señales clave ausentes en alguno de los dos lados (informativo, no conflicto). */
function missingSignals(input: ArticleMatchingInput, snap: ArticleSnapshot): string[] {
  const out: string[] = [];
  if (clean(input.brand) === '' || clean(snap.brand) === '') {
    if (clean(input.brand) !== '' || clean(snap.brand) !== '') out.push('la marca');
  }
  if (clean(input.model) === '' || clean(snap.model) === '') {
    if (clean(input.model) !== '' || clean(snap.model) !== '') out.push('el modelo');
  }
  return out;
}

export class DeterministicMatchEngineV1 implements ArticleMatchEngine {
  readonly version = ENGINE_VERSION;

  constructor(private readonly provider: CandidateProvider) {}

  async findCandidates(input: ArticleMatchingInput): Promise<EngineCandidate[]> {
    const snapshots = await this.provider.listCandidates(input);
    const results: EngineCandidate[] = [];
    for (const snap of snapshots) {
      const compared = comparePair(input, snap, this.version);
      if (compared) results.push(compared);
    }
    results.sort((x, y) => {
      if (y.score !== x.score) return y.score - x.score;
      if (x.conflicts.length !== y.conflicts.length) return x.conflicts.length - y.conflicts.length;
      const kx = `${x.article.companyCode}:${x.article.profitArticleCode}`;
      const ky = `${y.article.companyCode}:${y.article.profitArticleCode}`;
      return kx < ky ? -1 : kx > ky ? 1 : 0;
    });
    return results;
  }
}

/**
 * FASE 23 — Comparación pura de una pareja (misma lógica que
 * findCandidates, sin provider ni ordenamiento). Base de la detección
 * histórica. No decide SAME/DIFFERENT.
 */
export function comparePair(
  input: ArticleMatchingInput,
  snap: ArticleSnapshot,
  version: string = ENGINE_VERSION,
): EngineCandidate | null {
  const self = `${(input.companyCode ?? '').trim().toUpperCase()}:${(input.profitArticleCode ?? '').trim()}`;
  const key = `${snap.article.companyCode}:${snap.article.profitArticleCode}`;
  if (input.profitArticleCode && key === self) return null;
  const hasDescription = clean(input.description) !== '';
  const { evidence, conflicts, score } = compareSignals(input, snap);
  return {
    article: snap.article,
    confidence: score / 100,
    classification: classify(score, conflicts, hasDescription),
    evidence,
    conflicts,
    score,
    explanation: explainCandidate(evidence, conflicts, missingSignals(input, snap)),
    engineVersion: version,
  };
}
