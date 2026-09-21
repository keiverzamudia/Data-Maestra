/**
 * Payload definitivo de creación de artículo en Profit (FASE 14D §4 / 14E §5).
 * FASE 24.2: 19 columnas (las 15 originales + co_sucu, uni_compra, modelo,
 * ref). Sin `any`. Sin campos generados por Profit (rowguid, fecha_reg,
 * stocks), sin co_imp, sin master_code, sin fechas manuales.
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
  /**
   * Modelo del artículo (Profit art.modelo, char 20). Dato de negocio
   * opcional: si el usuario lo aporta llega a Profit; si no, queda vacío.
   * Nunca inventado.
   */
  model?: string;
  /**
   * Referencia del artículo (Profit art.ref, char 20). Igual que modelo:
   * opcional, solo con dato real aportado.
   */
  ref?: string;
  /**
   * Código del usuario de integración Profit (p. ej. DM). Lo establece el
   * motor desde PROFIT_INTEGRATION_USER_CODE; NUNCA proviene del frontend
   * (ClassifyRequestDto no tiene este campo) ni de la solicitud.
   */
  integrationUser?: string;
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
  /** Usuario de integración Profit (char(6), fijado por el motor). */
  co_us_in: string;
  /** Sucursal (char(6), automática '01'; FASE 24.2). */
  co_sucu: string;
  /** Unidad de compra (char(6), = unidad de venta; FASE 24.2). */
  uni_compra: string;
  /** Modelo (char(20), opcional; FASE 24.2). */
  modelo: string;
  /** Referencia (char(20), opcional; FASE 24.2). */
  ref: string;
}

/** Límites del contrato 14D §5/§8. */
export const MAX_CODE_ALLOCATION_ATTEMPTS = 10;
export const MAX_SEQUENCE_PER_PAIR = 9999;
export const SEQUENCE_WIDTH = 4;

const clean = (v: unknown): string => String(v ?? '').trim();

/**
 * Construye el payload sin co_art (puro, sin I/O). Los defaults de línea
 * AMBART se aplican aquí de forma explícita y auditable.
 * FASE 24.2: co_sucu='01' automático, uni_compra=uni_venta, modelo/ref solo
 * con dato real (char 20, trim). Sin fechas manuales.
 */
export function buildProfitArticlePayload(coArt: string, input: ProfitArticleInput): ProfitArticlePayload {
  const tipo = clean(input.articleType);
  const unit = clean(input.unitCode);
  return {
    co_art: clean(coArt),
    art_des: clean(input.description),
    tipo,
    co_lin: clean(input.groupCode),
    co_subl: clean(input.subgroupCode),
    uni_venta: unit,
    suni_venta: unit,
    tipo_imp: clean(input.taxType),
    co_cat: clean(input.categoryCode) || '01',
    co_color: clean(input.colorCode) || '01',
    procedenci: clean(input.originCode) || '01',
    co_prov: clean(input.providerCode) || 'GEN',
    tipo_cos: clean(input.costType) || (tipo === 'S' ? 'ULOM' : 'ULCO'),
    dis_cen: clean(input.disCen),
    co_us_in: clean(input.integrationUser),
    co_sucu: '01',
    uni_compra: unit,
    modelo: clean(input.model).slice(0, 20),
    ref: clean(input.ref).slice(0, 20),
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

/** Kinds de parámetro soportados (14K.5: NUNCA text: ODBC lo rechaza). */
export type ProfitParamKind = 'char' | 'varchar';

export interface ProfitParam {
  name: string;
  kind: ProfitParamKind;
  size: number;
  value: string;
}

export interface ProfitInsertStatement {
  sql: string;
  params: ProfitParam[];
}

/**
 * Sentencia INSERT explícita y controlada (14K.5): 19 columnas fijas
 * (15 originales + co_sucu, uni_compra, modelo, ref), sin TEXT
 * (dis_cen es VARCHAR(8000); la columna TEXT lo convierte). Pura y
 * testeable; el adapter solo mapea kinds al driver.
 * FASE 17: tableRef permite calificar la tabla ([DB].dbo.art) para el
 * registro multiempresa en el mismo servidor. Default = comportamiento
 * histórico (una sola base). Solo se aceptan referencias con formato
 * [base].dbo.[tabla] o dbo.tabla; cualquier otra cosa falla cerrado.
 */
export function buildInsertStatement(p: ProfitArticlePayload, tableRef = 'dbo.art'): ProfitInsertStatement {
  if (!/^(\[[A-Za-z0-9_]+\]\.dbo\.\[[a-z_]+\]|dbo\.art)$/i.test(tableRef)) {
    throw new Error('Referencia de tabla Profit inválida');
  }
  const cols = [
    'co_art', 'art_des', 'tipo', 'co_lin', 'co_subl', 'uni_venta', 'suni_venta',
    'tipo_imp', 'co_cat', 'co_color', 'procedenci', 'co_prov', 'tipo_cos', 'dis_cen',
    'co_us_in', 'co_sucu', 'uni_compra', 'modelo', 'ref',
  ];
  const P = (name: string, kind: ProfitParamKind, size: number, value: string): ProfitParam =>
    ({ name, kind, size, value });
  const params: ProfitParam[] = [
    P('co_art', 'char', 30, p.co_art),
    P('art_des', 'varchar', 120, p.art_des),
    P('tipo', 'char', 1, p.tipo),
    P('co_lin', 'char', 6, p.co_lin),
    P('co_subl', 'char', 6, p.co_subl),
    P('uni_venta', 'char', 6, p.uni_venta),
    P('suni_venta', 'char', 6, p.suni_venta),
    P('tipo_imp', 'char', 1, p.tipo_imp),
    P('co_cat', 'char', 6, p.co_cat),
    P('co_color', 'char', 6, p.co_color),
    P('procedenci', 'char', 6, p.procedenci),
    P('co_prov', 'char', 10, p.co_prov),
    P('tipo_cos', 'char', 4, p.tipo_cos),
    P('dis_cen', 'varchar', 8000, p.dis_cen),
    P('co_us_in', 'char', 6, p.co_us_in),
    P('co_sucu', 'char', 6, p.co_sucu),
    P('uni_compra', 'char', 6, p.uni_compra),
    P('modelo', 'char', 20, p.modelo),
    P('ref', 'char', 20, p.ref),
  ];
  return {
    sql: `INSERT INTO ${tableRef} (${cols.join(', ')}) VALUES (${cols.map((c) => '@' + c).join(', ')})`,
    params,
  };
}
