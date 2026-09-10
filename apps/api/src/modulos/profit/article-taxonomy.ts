/**
 * Taxonomía de tipo de artículo Profit (FASE 14C-FORM §5).
 *
 * Fuente maestra: restricción CHECK `CK_art_TIPO` sobre `dbo.art.tipo`
 * (V/F/C/S/M/N/E). NO es una lista manual: `ProfitAdapter.getArticleTypes()`
 * la deriva de la metadata real; aquí solo viven las etiquetas visibles
 * y las reglas de coherencia confirmadas por la auditoría 14B.
 */

/** Dominio completo del CHECK CK_art_TIPO (evidencia 14A). */
export const PROFIT_ARTICLE_TYPE_DOMAIN = ['V', 'F', 'C', 'S', 'M', 'N', 'E'] as const;
export type ProfitArticleTypeCode = (typeof PROFIT_ARTICLE_TYPE_DOMAIN)[number];

/** Tipos funcionales iniciales expuestos en el formulario (§5). */
export const FUNCTIONAL_ARTICLE_TYPES: ProfitArticleTypeCode[] = ['C', 'S', 'V'];

/** Tipos reservados: válidos por CHECK, sin semántica confirmada. */
export const RESERVED_ARTICLE_TYPES: ProfitArticleTypeCode[] = ['F', 'E', 'M', 'N'];

export const ARTICLE_TYPE_LABELS: Record<ProfitArticleTypeCode, string> = {
  C: 'Consumo',
  S: 'Servicio',
  V: 'Venta',
  F: 'Reservado F',
  E: 'Reservado E',
  M: 'Reservado M',
  N: 'Reservado N',
};

export function isArticleTypeCode(v: unknown): v is ProfitArticleTypeCode {
  return typeof v === 'string' && (PROFIT_ARTICLE_TYPE_DOMAIN as readonly string[]).includes(v);
}

/** Dominio de impuesto: tabulado.tipo 1-9 (evidencia 14B). */
export const PROFIT_TAX_TYPE_DOMAIN = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export function isTaxTypeCode(v: unknown): v is (typeof PROFIT_TAX_TYPE_DOMAIN)[number] {
  return typeof v === 'string' && (PROFIT_TAX_TYPE_DOMAIN as readonly string[]).includes(v);
}

/**
 * Tasa esperada por tipo según evidencia 14B (C/V→1 gravados, S→6 exento).
 * Es SUGERENCIA con excepciones reales en Profit (S con 1/4/5 existen),
 * por lo que una desviación es advertencia, nunca error bloqueante.
 */
export function expectedTaxTypeFor(articleType: ProfitArticleTypeCode): string {
  return articleType === 'S' ? '6' : '1';
}

export interface TaxCoherence {
  ok: boolean;
  /** Desviación documentada respecto a la regla confirmada (advertencia). */
  warning?: string;
}

export function checkTaxCoherence(articleType: string, taxType: string): TaxCoherence {
  if (!isArticleTypeCode(articleType) || !isTaxTypeCode(taxType)) return { ok: true };
  const expected = expectedTaxTypeFor(articleType);
  if (taxType !== expected) {
    return {
      ok: true,
      warning: `Tipo ${articleType} (${ARTICLE_TYPE_LABELS[articleType]}) suele usar tasa ${expected}; se indicó ${taxType} (excepción válida en Profit, verificar)`,
    };
  }
  return { ok: true };
}
