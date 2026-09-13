/**
 * Payload definitivo de creación de artículo en Profit (FASE 14D §4 / 14E §5).
 * Exactamente estos 14 campos. Sin `any`. Sin campos generados por Profit
 * (rowguid, fecha_reg, stocks), sin co_imp, sin master_code.
 */

/** Clasificación de Data-Maestra lista para convertirse en payload Profit. */
export interface ProfitArticleInput {
  description: string;
  articleType: string;
  groupCode: string;
  subgroupCode: string;
  unitCode: string;
  taxType: string;
  categoryCode?: string;
  colorCode?: string;
  originCode?: string;
  providerCode?: string;
  costType?: string;
  disCen?: string;
}

/** Fila a insertar en dbo.art. Todos char/varchar con trim aplicado. */
export interface ProfitArticlePayload {
  co_art: string;
  art_des: string;
  tipo: string;
  co_lin: string;
  co_subl: string;
  uni_venta: string;
  suni_venta: string;
  tipo_imp: string;
  co_cat: string;
  co_color: string;
  procedenci: string;
  co_prov: string;
  tipo_cos: string;
  dis_cen: string;
}

/** Límites del contrato 14D §5/§8. */
export const MAX_CODE_ALLOCATION_ATTEMPTS = 10;
export const MAX_SEQUENCE_PER_PAIR = 9999;
export const SEQUENCE_WIDTH = 4;

const clean = (v: unknown): string => String(v ?? '').trim();

/**
 * Construye el payload sin co_art (puro, sin I/O). Los defaults de línea
 * AMBART se aplican aquí de forma explícita y auditable.
 */
export function buildProfitArticlePayload(coArt: string, input: ProfitArticleInput): ProfitArticlePayload {
  const tipo = clean(input.articleType);
  return {
    co_art: clean(coArt),
    art_des: clean(input.description),
    tipo,
    co_lin: clean(input.groupCode),
    co_subl: clean(input.subgroupCode),
    uni_venta: clean(input.unitCode),
    suni_venta: clean(input.unitCode),
    tipo_imp: clean(input.taxType),
    co_cat: clean(input.categoryCode) || '01',
    co_color: clean(input.colorCode) || '01',
    procedenci: clean(input.originCode) || '01',
    co_prov: clean(input.providerCode) || 'GEN',
    tipo_cos: clean(input.costType) || (tipo === 'S' ? 'ULOM' : 'ULCO'),
    dis_cen: clean(input.disCen),
  };
}

/** Prefijo del código: TRIM(línea)+TRIM(sublínea), sin guion, sin inventos. */
export function profitCodePrefix(groupCode: string, subgroupCode: string): string {
  return `${clean(groupCode)}${clean(subgroupCode)}`;
}

/** Candidato {prefijo}{seq 4 dígitos}. Puro. */
export function profitCandidate(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(SEQUENCE_WIDTH, '0')}`;
}

/** Extrae el sufijo numérico si el código pertenece al prefijo. */
export function profitSequenceOf(coArt: string, prefix: string): number | null {
  const co = clean(coArt);
  if (!co.startsWith(prefix)) return null;
  const tail = co.slice(prefix.length);
  if (!/^\d{1,4}$/.test(tail)) return null;
  return parseInt(tail, 10);
}
