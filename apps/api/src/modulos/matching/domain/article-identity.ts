/**
 * FASE 18 (motor de coincidencia) — Identidad técnica del artículo Profit.
 *
 * Un artículo Profit es operacional y vive en UNA empresa. Su identidad
 * mínima es `companyCode + profitArticleCode`. El código Profit SOLO NO es
 * global: AD_TRANS:FERMIS0662 y AD_DIST:FERMIS0662 son registros diferentes
 * hasta que una decisión humana posterior determine equivalencia.
 */

/** Referencia estable a un artículo operacional en una empresa Profit. */
export interface ProfitArticleId {
  /** Código de empresa Profit (cod_emp de TEmpresas, p. ej. AD_TRANS). */
  companyCode: string;
  /** Código del artículo en esa empresa (co_art, p. ej. FERMIS0662). */
  profitArticleCode: string;
}

export function formatArticleId(id: ProfitArticleId): string {
  return `${id.companyCode}:${id.profitArticleCode}`;
}

export function sameArticle(a: ProfitArticleId, b: ProfitArticleId): boolean {
  return a.companyCode === b.companyCode && a.profitArticleCode === b.profitArticleCode;
}

/** Clave ordenada de pareja: A-B y B-A producen la misma clave. */
export function pairKey(a: ProfitArticleId, b: ProfitArticleId): string {
  const ka = formatArticleId(a);
  const kb = formatArticleId(b);
  return ka <= kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/** Orden canónico A/B para persistencia (evita decisiones duplicadas). */
export function normalizePair(
  a: ProfitArticleId,
  b: ProfitArticleId,
): { first: ProfitArticleId; second: ProfitArticleId } {
  return formatArticleId(a) <= formatArticleId(b) ? { first: a, second: b } : { first: b, second: a };
}
