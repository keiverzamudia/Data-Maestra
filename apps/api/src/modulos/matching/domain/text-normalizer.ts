/**
 * FASE 18 — Normalizador base determinístico de texto (versión v1, CONGELADA).
 *
 * Representación auxiliar para comparación. NUNCA reemplaza la descripción
 * original (ver regla de preservación en matching.service / perfil).
 * Sin diccionarios, sin IA, sin dependencias externas. Idempotente:
 * normalize(normalize(x)) === normalize(x).
 *
 * FASE 19 añade normalizeTextV2 (nueva versión, no modifica v1).
 */
export const NORMALIZATION_VERSION = 'v1';

export function normalizeText(input: string | null | undefined): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[.,;:()[\]"'`´¨°ºª]/g, ' ')
    .replace(/[-_/|\\+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * FASE 19 — Normalización v2 (nueva versión; v1 queda intacta).
 *
 * Cambios respecto a v1 (todos determinísticos y conservadores: nada se
 * elimina, solo se representan variantes de escritura de forma comparable):
 * - protege fracciones: "1 / 2" → "1/2"; un "/" suelto (no fracción) va a
 *   espacio como en v1; dos números separados sin slash jamás se fusionan;
 * - signos españoles ¿?¡! a espacio;
 * - compacta separador dentro de referencias alfanuméricas por pares de
 *   tokens adyacentes ("DT 466" → "DT466", "10 W40" → "10W40",
 *   "ABC123 01" → "ABC12301", "MOTOR 24V" → "MOTOR24V"). La fusión conserva
 *   todos los caracteres (no es eliminación); nunca fusiona número +
 *   palabra ("466 UND", "40 LIBRAS" intactos). Los tokens con "/" nunca se
 *   fusionan.
 * Idempotente: normalizeTextV2(normalizeTextV2(x)) === normalizeTextV2(x).
 */
export const NORMALIZATION_VERSION_V2 = 'v2';

/** Separador interno temporal para proteger fracciones durante la limpieza. */
const FRAC_SEP = '\uE000';

function baseTokensV2(input: string): string[] {
  const protectedInput = String(input)
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/(\d+)\s*\/\s*(\d+)/g, `$1${FRAC_SEP}$2`);
  return protectedInput
    .replace(/[.,;:()[\]"'`´¨°ºª¿?¡!/]/g, ' ')
    .replace(/[-_|\\+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((t) => t.split(FRAC_SEP).join('/'));
}

/**
 * Decide si dos tokens adyacentes forman una sola referencia técnica.
 * Devuelve el token fusionado o null. Conservadora por diseño (§22): la
 * fusión conserva todos los caracteres (no elimina como "FILTRO 10"→
 * "FILTRO"); nunca fusiona número + palabra ("466 UND" intacto).
 */
export function compactTokenPair(prev: string, next: string): string | null {
  if (!prev || !next || prev.includes('/') || next.includes('/')) return null;
  const prevHasLetter = /[A-Z]/.test(prev);
  const nextHasLetter = /[A-Z]/.test(next);
  const nextHasDigit = /\d/.test(next);
  // Letras + número: "DT 466", "P 550949", "MOTOR 24V", "ABC123 01".
  if (prevHasLetter && /^\d/.test(next)) {
    return prev + next;
  }
  // Dígito + alfanumérico con letras y dígitos: "10 W40".
  if (/\d$/.test(prev) && nextHasLetter && nextHasDigit && next.length <= 4) {
    return prev + next;
  }
  return null;
}

export function normalizeTextV2(input: string | null | undefined): string {
  if (input === null || input === undefined) return '';
  const tokens = baseTokensV2(input);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const merged = i + 1 < tokens.length ? compactTokenPair(tokens[i]!, tokens[i + 1]!) : null;
    if (merged !== null) {
      out.push(merged);
      i += 2;
    } else {
      out.push(tokens[i]!);
      i += 1;
    }
  }
  return out.join(' ');
}

/** Tokenización comparable (sobre texto ya normalizado v2). */
export function tokenizeV2(normalized: string): string[] {
  const t = normalizeTextV2(normalized);
  return t ? t.split(' ') : [];
}

