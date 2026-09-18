import { normalizeTextV2 } from './text-normalizer';

/**
 * FASE 19 — Extracción determinística de características auxiliares.
 *
 * Son SEÑALES para comparación futura, nunca datos oficiales: no modifican
 * Profit, la solicitud ni la clasificación. Conservadoras: ante duda, la
 * señal queda nula en lugar de inferir.
 */

/** Mapa canónico de unidades frecuentes (token → canónico). Sin conversiones. */
export const UNIT_CANONICAL: Readonly<Record<string, string>> = {
  KG: 'KG', KILOGRAMO: 'KG', KILOGRAMOS: 'KG',
  LB: 'LB', LIBRA: 'LB', LIBRAS: 'LB',
  MM: 'MM', MILIMETRO: 'MM', MILIMETROS: 'MM',
  CM: 'CM', CENTIMETRO: 'CM', CENTIMETROS: 'CM',
  V: 'V', VOLT: 'V', VOLTS: 'V', VOLTAJE: 'V',
  LT: 'LT', LITRO: 'LT', LITROS: 'LT',
  UND: 'UND', UNIDAD: 'UND', UNIDADES: 'UND',
};

export type TokenKind = 'PALABRA' | 'NUMERO' | 'TECNICO' | 'FRACCION';

export interface TokenInfo {
  token: string;
  kind: TokenKind;
}

export function classifyToken(token: string): TokenKind {
  if (token.includes('/')) return 'FRACCION';
  if (/^\d+$/.test(token)) return 'NUMERO';
  if (/\d/.test(token)) return 'TECNICO';
  return 'PALABRA';
}

export interface ExtractedFeatures {
  tokens: string[];
  technicalTokens: string[];
  unitCanonical: string | null;
  modelCandidate: string | null;
  partNumberCandidate: string | null;
  brandCandidate: string | null;
}

/**
 * Extrae señales de un texto ya normalizado v2.
 * @param knownBrands marcas del catálogo (ya en mayúsculas); match exacto,
 * solo el primer token coincidente. Sin diccionarios inventados.
 */
export function extractFeatures(normalizedV2: string, knownBrands: string[] = []): ExtractedFeatures {
  const tokens = normalizedV2 ? normalizedV2.split(' ').filter(Boolean) : [];
  const technicalTokens = tokens.filter((t) => classifyToken(t) === 'TECNICO' || classifyToken(t) === 'FRACCION');
  const unitCanonical = tokens.map((t) => UNIT_CANONICAL[t] ?? null).find((u): u is string => u !== null) ?? null;
  const modelCandidate = technicalTokens.find((t) => /^[A-Z]{1,6}[0-9][A-Z0-9]{0,8}$/.test(t)) ?? null;
  const partNumberCandidate =
    technicalTokens.find((t) => /^[A-Z0-9]{1,10}$/.test(t) && /\d/.test(t) && /[A-Z]/.test(t) && t.length >= 4) ?? null;
  const brandSet = new Set(knownBrands.map((b) => b.trim().toUpperCase()).filter(Boolean));
  const brandCandidate = tokens.find((t) => brandSet.has(t)) ?? null;
  return { tokens, technicalTokens, unitCanonical, modelCandidate, partNumberCandidate, brandCandidate };
}

/** Representación comparable completa v2 (texto + señales). */
export interface ComparableRepresentation {
  normalizedDescription: string;
  tokens: string[];
  technicalTokens: string[];
  unitCanonical: string | null;
  modelCandidate: string | null;
  partNumberCandidate: string | null;
  brandCandidate: string | null;
  normalizationVersion: 'v2';
}

export function comparableOf(description: string | null | undefined, knownBrands: string[] = []): ComparableRepresentation {
  const normalizedDescription = normalizeTextV2(description);
  const features = extractFeatures(normalizedDescription, knownBrands);
  return { normalizedDescription, ...features, normalizationVersion: 'v2' };
}
