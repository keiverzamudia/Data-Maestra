import type { CatalogRow, CorporateCatalogDescriptor } from './corporate-catalogs';

/**
 * FASE 17 §6/§12 — Comparación TRANS vs destino y construcción del SyncPlan.
 * Todo puro: sin I/O, sin SQL, testeable con fixtures.
 */

/** Estados conceptuales de comparación (§6). FASE 26: + EQUIVALENTE. */
export type CatalogDiffState =
  | 'IGUAL'
  | 'FALTA_EN_DESTINO'
  | 'DESCRIPCION_DIFERENTE'
  | 'DATOS_DIFERENTES'
  | 'NO_COMPATIBLE'
  | 'EQUIVALENTE'
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
  /**
   * FASE 26 — código que se usará en el destino cuando difiere del canónico
   * (equivalencia registrada). Ausente = mismo código que el estándar.
   */
  destCode?: string;
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
  /** FASE 26 — cubiertos por una equivalencia registrada (sin INSERT). */
  equivalentes: number;
  total: number;
}

const norm = (v: unknown): string => String(v ?? '').trim();

/**
 * Compara filas del estándar contra las del destino.
 *
 * FASE 26.4 — IDENTIDAD REAL. En catálogos jerárquicos la PK de Profit es el
 * PAR (padre, código): `sub_lin` repite el mismo `co_subl` bajo líneas
 * distintas (evidencia: ad_disay tiene ELE×4, CON×5, VEH×4, GEN×4…). Indexar
 * el destino SOLO por código emparejaba filas ajenas y disparaba un falso
 * "padre distinto" sobre descripciones que coincidían al 100% (CAM/CAMISAS,
 * LIMPIEZA/LIMPIEZA…). Ahora:
 *   - par presente → se compara únicamente la descripción;
 *   - par ausente  → FALTA_EN_DESTINO (no existe esa sublínea bajo esa línea;
 *     es un INSERT aditivo, no una corrupción: el PK no choca);
 *   - estándar sin padre → DATOS_DIFERENTES (no hay dónde colgarlo).
 *
 * El padre del estándar se traduce a código local vía `parentEquivalences`
 * antes de buscar, de modo que una línea con equivalencia registrada empareja
 * en lugar de proponer un duplicado.
 *
 * - Códigos solo en destino se ignoran (nunca se borra nada).
 */
export function compareCatalogRows(
  catalog: string,
  standard: CatalogRow[],
  dest: CatalogRow[],
  opts?: {
    parentAware?: boolean;
    equivalences?: Map<string, string>;
    /** Equivalencias del catálogo DUEÑO de la columna padre (sub_lin → lin_art). */
    parentEquivalences?: Map<string, string>;
  },
): CatalogDiff[] {
  const parentAware = !!opts?.parentAware;
  // FASE 26: el padre declarado en el estándar se traduce a su código local
  // antes de comparar (sub_lin colgará de la LÍNEA local equivalente).
  const parentMap = opts?.parentEquivalences ?? opts?.equivalences;
  const toLocal = (code: unknown): string => {
    const c = norm(code);
    if (!c) return c;
    return norm(parentMap?.get(c)) || c;
  };
  /** Clave de identidad: (padre|código) en jerárquicos, código en el resto. */
  const key = (parent: unknown, code: unknown): string =>
    parentAware ? `${norm(parent)}|${norm(code)}` : norm(code);

  const destByPair = new Map<string, CatalogRow>();
  for (const r of dest) {
    if (!norm(r.code)) continue;
    const k = key(r.parent, r.code);
    if (!destByPair.has(k)) destByPair.set(k, r);
  }

  const out: CatalogDiff[] = [];
  for (const s of standard) {
    const code = norm(s.code);
    if (!code) continue;
    const sParent = norm(s.parent);
    if (parentAware && !sParent) {
      // Sin padre declarado no existe la fila: no se adivina dónde colgarla.
      out.push({ catalog, code, standardValue: norm(s.description), destValue: null, state: 'DATOS_DIFERENTES' });
      continue;
    }
    const local = norm(opts?.equivalences?.get(code));
    const target = local && local !== code ? local : code;
    const d = destByPair.get(key(parentAware ? toLocal(sParent) : '', target));
    if (!d) {
      out.push({
        catalog, code, parent: sParent || undefined,
        standardValue: norm(s.description), destValue: null,
        state: 'FALTA_EN_DESTINO',
        ...(target !== code ? { destCode: target } : {}),
      });
      continue;
    }
    if (target !== code) {
      out.push({
        catalog, code, parent: sParent || undefined,
        standardValue: norm(s.description), destValue: norm(d.description),
        state: 'EQUIVALENTE', destCode: target,
      });
      continue;
    }
    out.push({
      catalog, code, parent: sParent || undefined,
      standardValue: norm(s.description), destValue: norm(d.description),
      state: norm(s.description) !== norm(d.description) ? 'DESCRIPCION_DIFERENTE' : 'IGUAL',
    });
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
/**
 * FASE 26.2 — `allowDescSync`: decisión explícita del administrador de que las
 * descripciones de AD_TRANS mandan en esa empresa. Sin el flag (default) el
 * comportamiento es idéntico al de la Fase 17: BLOCKED, fail-closed.
 */
export interface SyncPlanOptions {
  allowDescSync?: boolean;
}

export function buildSyncPlanItem(
  diff: CatalogDiff,
  desc?: CorporateCatalogDescriptor,
  opts?: SyncPlanOptions,
): SyncPlanItem {
  switch (diff.state) {
    case 'IGUAL':
      return { ...diff, operation: 'NO_ACTION', reason: 'Coincide con el estándar corporativo.', safe: true };
    case 'EQUIVALENTE':
      return {
        ...diff,
        operation: 'NO_ACTION',
        reason: `Equivalencia registrada (FASE 26): ${diff.code} equivale a ${diff.destCode ?? diff.code} en destino. Sin inserción.`,
        safe: true,
      };
    case 'FALTA_EN_DESTINO': {
      const local = diff.destCode && diff.destCode !== diff.code;
      return {
        ...diff,
        operation: 'INSERT',
        reason: local
          ? `Crear con el código local equivalente ${diff.destCode} (${desc?.label ?? diff.catalog}).`
          : `Crear con el mismo código del estándar (${desc?.label ?? diff.catalog}).`,
        safe: true,
      };
    }
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
      if (opts?.allowDescSync) {
        return {
          ...diff,
          operation: 'UPDATE_DESCRIPTION',
          reason: 'Autorizado por la empresa (FASE 26.2): la descripción de AD_TRANS manda.',
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
  const s: SyncPlanSummary = { iguales: 0, faltantes: 0, descripcionesDiferentes: 0, bloqueados: 0, errores: 0, equivalentes: 0, total: items.length };
  for (const i of items) {
    if (i.state === 'EQUIVALENTE') s.equivalentes++;
    else if (i.operation === 'NO_ACTION') s.iguales++;
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
