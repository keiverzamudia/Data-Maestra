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

/** Escapa los comodines LIKE de SQL Server/SQLite para uso literal. */
export function escapeLike(value: string): string {
  return value.replace(/[%_[\]]/g, (c) => `[${c}]`);
}
