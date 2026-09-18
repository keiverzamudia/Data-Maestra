import type { CatalogRow, CorporateCatalogDescriptor } from './corporate-catalogs';

/**
 * FASE 17 §6/§12 — Comparación TRANS vs destino y construcción del SyncPlan.
 * Todo puro: sin I/O, sin SQL, testeable con fixtures.
 */

/** Estados conceptuales de comparación (§6). */
export type CatalogDiffState =
  | 'IGUAL'
  | 'FALTA_EN_DESTINO'
  | 'DESCRIPCION_DIFERENTE'
  | 'DATOS_DIFERENTES'
  | 'NO_COMPATIBLE'
  | 'ERROR';

/** Operaciones posibles del plan (§12). */
export type SyncOperation = 'NO_ACTION' | 'INSERT' | 'UPDATE_DESCRIPTION' | 'BLOCKED';

export interface CatalogDiff {
  catalog: string;
  code: string;
  parent?: string;
  standardValue: string;
  destValue: string | null;
  state: CatalogDiffState;
}

export interface SyncPlanItem extends CatalogDiff {
  operation: SyncOperation;
  /** Motivo empresarial legible (para UI y auditoría). */
  reason: string;
  /** true cuando la operación es segura según evidencia Fase 16. */
  safe: boolean;
}

export interface SyncPlanSummary {
  iguales: number;
  faltantes: number;
  descripcionesDiferentes: number;
  bloqueados: number;
  errores: number;
  total: number;
}

const norm = (v: unknown): string => String(v ?? '').trim();

/**
 * Compara filas del estándar contra las del destino, código por código.
 * - Solo descripción distinta → DESCRIPCION_DIFERENTE (homologable, §16 F16).
 * - Padre distinto (sub_lin.co_lin) → DATOS_DIFERENTES (requiere revisión).
 * - Códigos solo en destino se ignoran (nunca se borra nada).
 */
export function compareCatalogRows(
  catalog: string,
  standard: CatalogRow[],
  dest: CatalogRow[],
  opts?: { parentAware?: boolean },
): CatalogDiff[] {
  const destByCode = new Map<string, CatalogRow>();
  for (const r of dest) {
    const code = norm(r.code);
    if (code && !destByCode.has(code)) destByCode.set(code, r);
  }
  const out: CatalogDiff[] = [];
  for (const s of standard) {
    const code = norm(s.code);
    if (!code) continue;
    const d = destByCode.get(code);
    if (!d) {
      out.push({ catalog, code, parent: norm(s.parent) || undefined, standardValue: norm(s.description), destValue: null, state: 'FALTA_EN_DESTINO' });
      continue;
    }
    if (opts?.parentAware && norm(s.parent) !== norm(d.parent)) {
      out.push({ catalog, code, parent: norm(s.parent) || undefined, standardValue: norm(s.description), destValue: norm(d.description), state: 'DATOS_DIFERENTES' });
      continue;
    }
    if (norm(s.description) !== norm(d.description)) {
      out.push({ catalog, code, parent: norm(s.parent) || undefined, standardValue: norm(s.description), destValue: norm(d.description), state: 'DESCRIPCION_DIFERENTE' });
      continue;
    }
    out.push({ catalog, code, parent: norm(s.parent) || undefined, standardValue: norm(s.description), destValue: norm(d.description), state: 'IGUAL' });
  }
  return out;
}

/**
 * Catálogos cuya descripción es funcionalmente global (tasas estatutarias y
 * unidades físicas). Evidencia Fase 17.2: todas sus diferencias observadas
 * son cosméticas (KILOGRAMOS/KILOS, UNIDAD/UNIDADES). Solo en ellos una
 * diferencia solo-descripción puede homologarse automáticamente.
 * En los demás catálogos los códigos son namespaces locales por empresa
 * (evidencia: lin_art 01 = FLETES en TRANS vs COMBUSTIBLE en DIST;
 * cat_art 002 = REPUESTO vs ARTICULOS DE OFICINA): actualizar la
 * descripción corrompería el significado local → REQUIERE_REVISION_HUMANA.
 */
export const SAFE_DESC_CATALOGS: ReadonlyArray<string> = ['tabulado', 'unidades'];

/**
 * Construye el plan determinístico (§12, FASE 17.2 §10): comparar → plan →
 * preflight → ejecutar. IGUAL no escribe; FALTA crea con código del estándar
 * (el código no existe en destino: nada que corromper); solo-descripción
 * actualiza descripción SOLO en catálogos funcionalmente globales;
 * resto bloquea sin adivinar.
 */
export function buildSyncPlanItem(diff: CatalogDiff, desc?: CorporateCatalogDescriptor): SyncPlanItem {
  switch (diff.state) {
    case 'IGUAL':
      return { ...diff, operation: 'NO_ACTION', reason: 'Coincide con el estándar corporativo.', safe: true };
    case 'FALTA_EN_DESTINO':
      return {
        ...diff,
        operation: 'INSERT',
        reason: `Crear con el mismo código del estándar (${desc?.label ?? diff.catalog}).`,
        safe: true,
      };
    case 'DESCRIPCION_DIFERENTE': {
      // Fail-closed: sin descriptor de catálogo no puede afirmarse seguridad.
      if (desc && SAFE_DESC_CATALOGS.includes(desc.key)) {
        return {
          ...diff,
          operation: 'UPDATE_DESCRIPTION',
          reason: 'Solo cambia la descripción en catálogo funcional; el código se conserva.',
          safe: true,
        };
      }
      return {
        ...diff,
        operation: 'BLOCKED',
        reason: 'Descripción con posible significado local: requiere revisión humana, no se homologa automáticamente.',
        safe: false,
      };
    }
    case 'DATOS_DIFERENTES':
    case 'NO_COMPATIBLE':
    case 'ERROR':
    default:
      return {
        ...diff,
        operation: 'BLOCKED',
        reason: 'Requiere revisión: no se puede homologar automáticamente.',
        safe: false,
      };
  }
}

export function summarizePlan(items: SyncPlanItem[]): SyncPlanSummary {
  const s: SyncPlanSummary = { iguales: 0, faltantes: 0, descripcionesDiferentes: 0, bloqueados: 0, errores: 0, total: items.length };
  for (const i of items) {
    if (i.operation === 'NO_ACTION') s.iguales++;
    else if (i.operation === 'INSERT') s.faltantes++;
    else if (i.operation === 'UPDATE_DESCRIPTION') s.descripcionesDiferentes++;
    else if (i.state === 'ERROR') s.errores++;
    else s.bloqueados++;
  }
  return s;
}

/** El plan es ejecutable solo si no hay bloqueos ni errores (§13/§30). */
export function isPlanExecutable(items: SyncPlanItem[]): boolean {
  return items.every((i) => i.operation !== 'BLOCKED' && i.state !== 'ERROR');
}

// ---------------------------------------------------------------------------
// FASE 17.1 — Compatibilidad funcional de TrigI_art con el INSERT de
// Data-Maestra. La comparación byte a byte es insuficiente: el citado con
// corchetes y la calificación con el esquema default ([dbo].[art] vs art)
// cambian el texto sin cambiar la lógica. Regla conservadora: solo se acepta
// el texto idéntico o el idéntico salvo ese estilo; CUALQUIER otra diferencia
// de tokens sigue bloqueando. Pura y testeable. Jamás deshabilita triggers.
// ---------------------------------------------------------------------------

export type TrigCompatReason = 'IDENTICO' | 'CITADO' | 'DIFIERE' | 'ILEGIBLE';

export interface TrigCompat {
  compatible: boolean;
  reason: TrigCompatReason;
}

/** Normaliza espacios y caso (comparación textual estricta). */
export function normDef(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Normaliza espacios/caso, elimina corchetes de citado y la calificación con
 * el esquema default (dbo.). Solo estilo: [dbo].[TrigI_art] ≡ TrigI_art.
 * Cualquier otro esquema, objeto o token distinto sigue bloqueando.
 */
export function normTrigDef(v: unknown): string {
  return String(v ?? '')
    .replace(/[[\]]/g, '')
    .replace(/\bdbo\./gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function trigInsertCompatible(stdDef: unknown, destDef: unknown): TrigCompat {
  const std = String(stdDef ?? '').trim();
  const dest = String(destDef ?? '').trim();
  if (!std || !dest) return { compatible: false, reason: 'ILEGIBLE' };
  if (normDef(std) === normDef(dest)) return { compatible: true, reason: 'IDENTICO' };
  if (normTrigDef(std) === normTrigDef(dest)) return { compatible: true, reason: 'CITADO' };
  return { compatible: false, reason: 'DIFIERE' };
}

// ---------------------------------------------------------------------------
// Verificación posterior del artículo (§24): compara valores relevantes del
// payload esperado contra lo leído. No basta EXISTS. Pura.
// ---------------------------------------------------------------------------

const ARTICLE_FIELDS = [
  'co_art', 'art_des', 'tipo', 'co_lin', 'co_subl', 'uni_venta', 'suni_venta',
  'tipo_imp', 'co_cat', 'co_color', 'procedenci', 'co_prov', 'tipo_cos', 'co_us_in',
] as const;

export function compareArticlePayload(
  actual: Record<string, unknown> | null,
  expected: Record<string, unknown>,
): string[] {
  if (!actual) return ['NOT_FOUND'];
  const differences: string[] = [];
  for (const f of ARTICLE_FIELDS) {
    if (norm(actual[f]) !== norm(expected[f])) differences.push(f);
  }
  // dis_cen: Profit puede normalizar texto; diferencia solo si ambos no
  // vacíos y distintos (misma regla que verifyAndReconcile).
  if (norm(actual['dis_cen']) !== norm(expected['dis_cen']) && norm(actual['dis_cen']) && norm(expected['dis_cen'])) {
    differences.push('dis_cen');
  }
  return differences;
}

// ---------------------------------------------------------------------------
// Preflight global (§15): 15 checks por empresa. Todo-o-nada: una sola
// empresa con error → cero escrituras (§13).
// ---------------------------------------------------------------------------

export type PreflightCheckKey =
  | 'IN_DIRECTORY'
  | 'VALID_NAME'
  | 'CONNECTION'
  | 'SCHEMA'
  | 'REQUIRED_TABLES'
  | 'REQUIRED_COLUMNS'
  | 'TRIGGERS'
  | 'REQUIRED_CATALOGS'
  | 'FK_DEPS'
  | 'DEFAULTS_01_GEN'
  | 'WRITE_PERMISSION'
  | 'CODE_CONFLICTS'
  | 'SEQUENCE_CONFLICT'
  | 'DISCEN_ACCOUNTS'
  | 'TRIGGER_COMPAT';

export interface PreflightCheck {
  key: PreflightCheckKey;
  ok: boolean;
  detail: string;
}

export interface CompanyPreflight {
  company: string;
  ok: boolean;
  checks: PreflightCheck[];
}

export interface GlobalPreflight {
  ok: boolean;
  companies: CompanyPreflight[];
}

/** Evaluación todo-o-nada a partir de checks ya recolectados. Pura. */
export function evaluateGlobalPreflight(companies: CompanyPreflight[]): GlobalPreflight {
  const normalized = companies.map((c) => ({ ...c, ok: c.checks.length > 0 && c.checks.every((k) => k.ok) }));
  return { ok: normalized.length > 0 && normalized.every((c) => c.ok), companies: normalized };
}

export function failedChecks(p: GlobalPreflight): Array<{ company: string; key: PreflightCheckKey; detail: string }> {
  const out: Array<{ company: string; key: PreflightCheckKey; detail: string }> = [];
  for (const c of p.companies) {
    for (const k of c.checks) {
      if (!k.ok) out.push({ company: c.company, key: k.key, detail: k.detail });
    }
  }
  return out;
}
