import { BadRequestException } from '@nestjs/common';
import { CORPORATE_CATALOGS, type CorporateCatalogKey } from './corporate-catalogs';
import { STANDARD_COMPANY, assertValidCompanyName, normalizeCompany } from './corporate-company';
import type { ProfitArticlePayload } from './profit-article.payload';

/**
 * FASE 26 — Equivalencias de catálogos entre empresas (AD_TRANS canónico).
 *
 * Módulo PURO: sin I/O, sin Prisma, sin SQL. Todo el razonamiento sobre
 * equivalencias vive aquí para poder probarlo con fixtures.
 *
 * Regla de resolución (siempre en este orden):
 *   1. equivalencia registrada → se usa el código local de esa empresa;
 *   2. código estándar existente → se usa tal cual (resolverCode devuelve el
 *      estándar y quien valida es el preflight);
 *   3. ninguno → se replica el catálogo desde AD_TRANS (plan de homologación).
 *
 * Nunca se adivina por descripción parecida: el vínculo es explícito y
 * auditable. Ver "La regla clave" en docs/MANUAL_DESARROLLADOR.md.
 */

/** Registro mínimo de una equivalencia. */
export interface EquivalenceRecord {
  id: string;
  catalogKey: CorporateCatalogKey;
  companyCode: string;
  standardCode: string;
  localCode: string;
  active: boolean;
  note: string | null;
  createdBy: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

/** Contrato que resuelven el servicio real y el objeto identidad de tests. */
export interface EquivalenceLookup {
  /** Mapa canónico → local de UN catálogo en UNA empresa (vacío si no hay). */
  codesForCatalog(company: string, catalogKey: CorporateCatalogKey): Promise<Map<string, string>>;
  /** Código a usar en esa empresa para un código canónico AD_TRANS. */
  resolveCode(company: string, catalogKey: CorporateCatalogKey, standardCode: string): Promise<string>;
  /** Payload con las claves foráneas traducidas a los códigos de esa empresa. */
  resolvePayload(company: string, payload: ProfitArticlePayload): Promise<ProfitArticlePayload>;
}

/** Objeto identidad: sin equivalencias registradas → comportamiento previo. */
export const NO_EQUIVALENCES: EquivalenceLookup = {
  codesForCatalog: async () => new Map<string, string>(),
  resolveCode: async (_company, _catalogKey, standardCode) => standardCode,
  resolvePayload: async (_company, payload) => payload,
};

/**
 * Columnas del payload que son claves foráneas a catálogos y por tanto deben
 * traducirse por empresa. El resto (art_des, tipo, dis_cen, co_sucu, modelo,
 * ref, co_us_in, tipo_cos, co_art) es idéntico en todas: ahí está la garantía
 * de "mismo código y misma data en todas las bases".
 */
export const PAYLOAD_FK_COLUMNS: ReadonlyArray<{
  column: keyof ProfitArticlePayload;
  catalog: CorporateCatalogKey;
}> = [
  { column: 'co_lin', catalog: 'lin_art' },
  { column: 'co_subl', catalog: 'sub_lin' },
  { column: 'uni_venta', catalog: 'unidades' },
  { column: 'suni_venta', catalog: 'unidades' },
  { column: 'tipo_imp', catalog: 'tabulado' },
  { column: 'co_cat', catalog: 'cat_art' },
  { column: 'co_color', catalog: 'colores' },
  { column: 'procedenci', catalog: 'proceden' },
  { column: 'co_prov', catalog: 'prov' },
];

const CODE_RE = /^[A-Za-z0-9][A-Za-z0-9_.\-]{0,29}$/;

const norm = (v: unknown): string => String(v ?? '').trim();

/** Clave interna de un registro: catálogo|empresa|código canónico. Pura. */
export function equivalenceKey(catalogKey: string, companyCode: string, standardCode: string): string {
  return `${norm(catalogKey)}|${normalizeCompany(companyCode)}|${norm(standardCode)}`;
}

/**
 * Indexa filas activas por `equivalenceKey`. Las inactivas se ignoran
 * (desactivar es borrar lógico: el histórico queda en auditoría). Pura.
 */
export function buildEquivalenceMap(rows: ReadonlyArray<EquivalenceRecord>): Map<string, EquivalenceRecord> {
  const out = new Map<string, EquivalenceRecord>();
  for (const r of rows ?? []) {
    if (!r || r.active === false) continue;
    const key = equivalenceKey(r.catalogKey, r.companyCode, r.standardCode);
    if (!out.has(key)) out.set(key, r);
  }
  return out;
}

/** Devuelve el código local o el canónico si no hay equivalencia. Pura. */
export function resolveCodeWithMap(
  map: Map<string, EquivalenceRecord> | undefined,
  catalogKey: CorporateCatalogKey,
  companyCode: string,
  standardCode: string,
): string {
  const std = norm(standardCode);
  if (!std) return std;
  const rec = map?.get(equivalenceKey(catalogKey, companyCode, std));
  return rec ? norm(rec.localCode) : std;
}

/**
 * Traduce las claves foráneas del payload a los códigos de la empresa.
 * `co_art` y el resto de columnas NO se tocan: el código del artículo es
 * idéntico en todas las bases (regla del usuario). Pura.
 */
export function resolvePayloadWithMap(
  payload: ProfitArticlePayload,
  map: Map<string, EquivalenceRecord> | undefined,
  companyCode: string,
): ProfitArticlePayload {
  if (!map || map.size === 0) return payload;
  const out: Record<string, unknown> = { ...payload };
  for (const { column, catalog } of PAYLOAD_FK_COLUMNS) {
    const current = norm(out[column]);
    if (!current) continue;
    out[column] = resolveCodeWithMap(map, catalog, companyCode, current);
  }
  return out as unknown as ProfitArticlePayload;
}

export interface EquivalenceInput {
  catalogKey?: unknown;
  companyCode?: unknown;
  standardCode?: unknown;
  localCode?: unknown;
  note?: unknown;
}

/**
 * Valida una equivalencia antes de persistirla. Falla cerrado: catálogo
 * desconocido, empresa estándar o formato de código sospechoso rechazan con
 * BadRequest (nunca llegan a la base). Pura.
 */
export function validateEquivalence(input: EquivalenceInput): {
  catalogKey: CorporateCatalogKey;
  companyCode: string;
  standardCode: string;
  localCode: string;
  note: string | null;
} {
  const catalogKey = norm(input.catalogKey) as CorporateCatalogKey;
  if (!CORPORATE_CATALOGS[catalogKey]) {
    throw new BadRequestException(`Catálogo desconocido: "${norm(input.catalogKey)}".`);
  }
  const companyCode = assertValidCompanyName(input.companyCode);
  if (companyCode === STANDARD_COMPANY) {
    throw new BadRequestException('AD_TRANS es la referencia canónica: no se registra equivalencia contra sí misma.');
  }
  const standardCode = norm(input.standardCode);
  const localCode = norm(input.localCode);
  if (!CODE_RE.test(standardCode)) {
    throw new BadRequestException(`Código canónico inválido: "${standardCode}".`);
  }
  if (!CODE_RE.test(localCode)) {
    throw new BadRequestException(`Código local inválido: "${localCode}".`);
  }
  if (standardCode.toUpperCase() === localCode.toUpperCase()) {
    throw new BadRequestException('La equivalencia debe vincular códigos distintos.');
  }
  const note = input.note === undefined || input.note === null ? null : norm(input.note);
  return { catalogKey, companyCode, standardCode, localCode, note: note || null };
}
