/**
 * FASE 22 — Cobertura de información y fingerprints de preselección.
 *
 * Cobertura responde "¿cuánta información útil tenemos de este artículo?"
 * NUNCA "¿es el mismo artículo?" (calidad ≠ similitud). Todo puro y
 * determinístico. Los fingerprints solo reducen el universo de candidatos
 * para FASE 23; jamás afirman identidad.
 */

export type CoverageLevel = 'INSUFICIENTE' | 'BASICA' | 'COMPARABLE' | 'RICA';

export interface CoverageSignals {
  normalizedDescription: string | null | undefined;
  tokens: string[];
  technicalTokens: string[];
  brand?: string | null;
  model?: string | null;
  partNumber?: string | null;
  unit?: string | null;
  category?: string | null;
}

/**
 * INSUFICIENTE: sin descripción utilizable (prácticamente imposible de comparar).
 * BASICA: descripción con palabras pero sin señales técnicas ni atributos.
 * COMPARABLE: tokens técnicos o algún atributo identificativo.
 * RICA: tokens técnicos + al menos 2 atributos identificativos.
 */
export function assessCoverage(s: CoverageSignals): CoverageLevel {
  const tokens = (s.tokens ?? []).filter((t) => t.trim() !== '');
  const technical = (s.technicalTokens ?? []).filter((t) => t.trim() !== '');
  const described = (s.normalizedDescription ?? '').trim().length >= 3;
  if (!described || tokens.length === 0) return 'INSUFICIENTE';
  const attrs = [s.brand, s.model, s.partNumber, s.unit, s.category].filter(
    (v) => (v ?? '').trim() !== '',
  ).length;
  if (technical.length > 0 && attrs >= 2) return 'RICA';
  if (technical.length > 0 || attrs >= 1) return 'COMPARABLE';
  return 'BASICA';
}

/**
 * Fingerprint determinístico de preselección: tokens técnicos ordenados +
 * modelo/parte normalizados. Dos artículos con igual fingerprint comparten
 * señales exactas (candidatos probables para FASE 23), pero la igualdad de
 * fingerprints NO significa mismo artículo.
 */
export function buildFingerprint(parts: {
  technicalTokens: string[];
  model?: string | null;
  partNumber?: string | null;
}): string {
  const tech = [...new Set((parts.technicalTokens ?? []).map((t) => t.trim()).filter(Boolean))].sort();
  const extra = [(parts.model ?? '').trim(), (parts.partNumber ?? '').trim()].filter(Boolean);
  return [...tech, ...extra].join('|');
}
