import { assertValidCompanyName } from './corporate-company';

/**
 * FASE 17 §5/§8 — Catálogos del ecosistema maestro homologable, en orden
 * de dependencias (Fase 16 §17). Columnas reales verificadas en Fase 16 §6.
 * Alcance cerrado: movimientos, stocks, costos, precios, documentos,
 * auditoría, xart_cont, art_ext, kit, lote quedan FUERA (§5, §29).
 */

export type CorporateCatalogKey =
  | 'tabulado'
  | 'unidades'
  | 'lin_art'
  | 'sub_lin'
  | 'cat_art'
  | 'colores'
  | 'prov'
  | 'proceden';

export interface CorporateCatalogDescriptor {
  key: CorporateCatalogKey;
  /** Etiqueta empresarial (sin jerga técnica). */
  label: string;
  table: string;
  codeColumn: string;
  descColumn: string;
  /** Columna padre para catálogos jerárquicos (solo sub_lin → co_lin). */
  parentColumn?: string;
  /**
   * La tabla tiene co_us_in (evidencia Fase 16 §6: todas menos tabulado).
   * Se registra el usuario de integración al crear elementos faltantes.
   */
  acceptsIntegrationUser: boolean;
}

export const CORPORATE_CATALOG_ORDER: CorporateCatalogKey[] = [
  'tabulado',
  'unidades',
  'lin_art',
  'sub_lin',
  'cat_art',
  'colores',
  'prov',
  'proceden',
];

export const CORPORATE_CATALOGS: Record<CorporateCatalogKey, CorporateCatalogDescriptor> = {
  tabulado: { key: 'tabulado', label: 'Tasas de impuesto', table: 'tabulado', codeColumn: 'tipo', descColumn: 'descripcio', acceptsIntegrationUser: false },
  unidades: { key: 'unidades', label: 'Unidades', table: 'unidades', codeColumn: 'co_uni', descColumn: 'des_uni', acceptsIntegrationUser: true },
  lin_art: { key: 'lin_art', label: 'Líneas', table: 'lin_art', codeColumn: 'co_lin', descColumn: 'lin_des', acceptsIntegrationUser: true },
  sub_lin: { key: 'sub_lin', label: 'Sublíneas', table: 'sub_lin', codeColumn: 'co_subl', descColumn: 'subl_des', parentColumn: 'co_lin', acceptsIntegrationUser: true },
  cat_art: { key: 'cat_art', label: 'Categorías', table: 'cat_art', codeColumn: 'co_cat', descColumn: 'cat_des', acceptsIntegrationUser: true },
  colores: { key: 'colores', label: 'Marcas', table: 'colores', codeColumn: 'co_col', descColumn: 'des_col', acceptsIntegrationUser: true },
  prov: { key: 'prov', label: 'Proveedores', table: 'prov', codeColumn: 'co_prov', descColumn: 'prov_des', acceptsIntegrationUser: true },
  proceden: { key: 'proceden', label: 'Procedencias', table: 'proceden', codeColumn: 'cod_proc', descColumn: 'des_proc', acceptsIntegrationUser: true },
};

/**
 * Referencia three-part a una tabla de una empresa. La base se valida con
 * formato estricto (nunca interpolación libre) y se cita con corchetes.
 * Columnas/tablas provienen solo de CORPORATE_CATALOGS (constantes).
 */
export function companyTableRef(db: string, table: string): string {
  const safeDb = assertValidCompanyName(db);
  const safeTable = String(table ?? '').trim();
  if (!/^[a-z_][a-z0-9_]*$/i.test(safeTable)) {
    throw new Error('Tabla corporativa inválida');
  }
  return `[${safeDb}].dbo.[${safeTable}]`;
}

export interface CatalogRow {
  code: string;
  description: string;
  parent?: string;
}

/** SELECT de catálogo en una empresa (solo lectura). Puro. */
export function catalogSelectSql(desc: CorporateCatalogDescriptor): { sql: string; db: '__DB__' } {
  const cols = [`LTRIM(RTRIM(${desc.codeColumn})) AS code`, `LTRIM(RTRIM(${desc.descColumn})) AS description`];
  if (desc.parentColumn) cols.push(`LTRIM(RTRIM(${desc.parentColumn})) AS parent`);
  // El calificador de base se aplica en el servicio sobre una conexión del
  // mismo servidor (three-part). Aquí se devuelve el cuerpo; el servicio
  // antepone [DB].dbo mediante companyTableRef.
  return {
    sql: `SELECT ${cols.join(', ')} FROM __TABLE__ ORDER BY 1`,
    db: '__DB__',
  };
}

/** Construye el SELECT completo para una empresa validada. Puro. */
export function catalogSelectForCompany(desc: CorporateCatalogDescriptor, db: string): string {
  const { sql } = catalogSelectSql(desc);
  return sql.replace('__TABLE__', companyTableRef(db, desc.table));
}

/** INSERT de un elemento faltante con el código del estándar (§6). Puro. */
export function catalogInsertForCompany(
  desc: CorporateCatalogDescriptor,
  db: string,
  opts?: { integrationUser?: string },
): { sql: string; params: string[] } {
  const ref = companyTableRef(db, desc.table);
  const cols = [desc.codeColumn, desc.descColumn];
  const vals = ['@c0', '@c1'];
  const params = ['c0', 'c1'];
  if (desc.parentColumn) {
    cols.push(desc.parentColumn);
    vals.push('@c2');
    params.push('c2');
  }
  if (desc.acceptsIntegrationUser && opts?.integrationUser) {
    cols.push('co_us_in');
    vals.push('@cu');
    params.push('cu');
  }
  return { sql: `INSERT INTO ${ref} (${cols.join(', ')}) VALUES (${vals.join(', ')})`, params };
}

/** UPDATE solo de descripción (nunca código/PK, §6-§7). Puro. */
export function catalogUpdateDescForCompany(desc: CorporateCatalogDescriptor, db: string): string {
  const ref = companyTableRef(db, desc.table);
  return `UPDATE ${ref} SET ${desc.descColumn} = @c1 WHERE LTRIM(RTRIM(${desc.codeColumn})) = LTRIM(RTRIM(@c0))`;
}
