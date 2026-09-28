/**
 * FASE P5 — tokenización compartida de la búsqueda de artículos.
 *
 * La búsqueda manual y la consulta en vivo deben comportarse igual: si no,
 * el usuario ve "no existe" en local y "sí existe" en Profit (o al revés).
 * Por eso la tokenización vive aquí y la consumen tanto MatchingRepository
 * (perfiles locales) como HistoricalUniverseService (SELECT en Profit).
 *
 * Reglas (monótonas: todo lo que coincidía con frase completa sigue
 * coincidiendo; solo se amplía, nunca se pierde una coincidencia):
 *  - se parte por no-alfanuméricos → "338-1488-CAT" → 338, 1488, CAT;
 *  - mayúsculas siempre (SQL LIKE/SQLite son case-insensitive);
 *  - cada token se conserva con acentos (`raw`) y sin acentos (`folded`):
 *    `raw` golpea `originalDescription`/`art_des` (con acentos) y `folded`
 *    golpea `normalizedDescription` (v2, sin acentos);
 *  - tokens de 1 carácter y repetidos se descartan;
 *  - tope de 8 tokens: una búsqueda es dirigida, no un scanner.
 *
 * Si tras todo eso no queda ningún token ("A B"), la llamante vuelve a la
 * frase completa: nunca se devuelve una búsqueda vacía por tokenización.
 */

import { MATCH_TUNING } from './match-tuning';

export interface SearchToken {
  /** Tal como lo escribió el usuario, en mayúsculas y con sus acentos. */
  raw: string;
  /** Sin acentos: forma que usa normalizedDescription (normalizador v2). */
  folded: string;
}

export const MAX_SEARCH_TOKENS = 8;
const MIN_TOKEN_LENGTH = 2;

const stripAccents = (value: string): string =>
  value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Parte el texto en tokens comparables (ver JSDoc del módulo). */
export function splitSearchTokens(term: string): SearchToken[] {
  const text = (term ?? '').trim().toUpperCase();
  if (!text) return [];
  const pieces = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens: SearchToken[] = [];
  const seen = new Set<string>();
  for (const raw of pieces) {
    const folded = stripAccents(raw);
    if (folded.length < MIN_TOKEN_LENGTH) continue;
    if (seen.has(folded)) continue;
    seen.add(folded);
    tokens.push({ raw, folded });
    if (tokens.length >= MAX_SEARCH_TOKENS) break;
  }
  return tokens;
}

/** Variantes a probar para un token (sin duplicar cuando raw === folded). */
export function tokenVariants(token: SearchToken): string[] {
  return token.raw === token.folded ? [token.raw] : [token.raw, token.folded];
}

/** Distancia de edición con tope (aborta cuando ya supera `cap`). */
export function editDistance(a: string, b: string, cap = 2): number {
  const x = a ?? '';
  const y = b ?? '';
  if (x === y) return 0;
  if (Math.abs(x.length - y.length) > cap) return cap + 1;
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= y.length; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
      curr.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > cap) return cap + 1;
    prev = curr;
  }
  return prev[y.length]!;
}

/**
 * Recall tolerante del motor (no búsqueda literal): dos tokens se solapan
 * cuando son iguales, uno contiene al otro (`VASO` ⊂ `VASOS`), comparten un
 * prefijo largo (abreviaturas: `MACK` ⊂ `MACKGRANITE`) o, SOLO en tokens
 * largos, difieren en 1–2 ediciones (typos: `TORNILLO` ↔ `TORNILO`).
 *
 * Calibración (MATCH_TUNING.tolerance, una sola fuente de verdad para
 * recall Y scoring):
 *  1. igualdad exacta → sí;
 *  2. longitud < minLengthExact (p. ej. `DE`) solo exacta: una stopword
 *     no puede volverse comodín;
 *  3. subcadena en cualquier dirección → sí (relación de contención real);
 *  4. prefijo común ≥ sharedPrefixMin → sí (abreviaturas);
 *  5. distancia de edición PROHIBIDA en tokens de 4–5 letras y acotada
 *     en los largos (≥6 → 1 edición, ≥8 → 2). Motivo: en 4–5 letras vive
 *     el ruido real — `VASO` y `PASO` distan una letra y nunca son el
 *     mismo artículo; permitir edición ahí metía CAJA DE PASO en una
 *     búsqueda de "vaso".
 */
export function tokensOverlapTolerant(a: string, b: string): boolean {
  const x = (a ?? '').trim();
  const y = (b ?? '').trim();
  if (!x || !y) return false;
  if (x === y) return true;
  const t = MATCH_TUNING.tolerance;
  const minLen = Math.min(x.length, y.length);
  if (minLen < t.minLengthExact) return false;
  if (x.includes(y) || y.includes(x)) return true;
  let common = 0;
  while (common < minLen && x[common] === y[common]) common += 1;
  if (common >= t.sharedPrefixMin) return true;
  const allowed =
    minLen >= t.editMinLength2 ? t.editMax2 : minLen >= t.editMinLength1 ? t.editMax1 : 0;
  if (allowed <= 0) return false;
  return editDistance(x, y, allowed) <= allowed;
}

/** Escapa los comodines LIKE de SQL Server/SQLite para uso literal. */
export function escapeLike(value: string): string {
  return value.replace(/[%_[\]]/g, (c) => `[${c}]`);
}
