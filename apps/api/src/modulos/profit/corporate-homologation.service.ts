import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { ProfitAdapterService } from './profit-adapter.service';
import { ProfitWriteAdapterService, type ProfitTxQuery } from './profit-write.adapter';
import { CorporateCompaniesService } from './corporate-companies.service';
import {
  STANDARD_COMPANY,
  STANDARD_ACCOUNTING_DB,
  normalizeCompanyList,
} from './corporate-company';
import {
  CORPORATE_CATALOGS,
  CORPORATE_CATALOG_ORDER,
  catalogSelectForCompany,
  catalogInsertForCompany,
  catalogUpdateDescForCompany,
  companyTableRef,
  type CatalogRow,
  type CorporateCatalogDescriptor,
  type CorporateCatalogKey,
} from './corporate-catalogs';
import {
  compareCatalogRows,
  buildSyncPlanItem,
  summarizePlan,
  isPlanExecutable,
  compareArticlePayload,
  evaluateGlobalPreflight,
  trigInsertCompatible,
  type CompanyPreflight,
  type GlobalPreflight,
  type PreflightCheck,
  type PreflightCheckKey,
  type SyncPlanItem,
  type SyncPlanSummary,
} from './corporate-compare';
import {
  buildProfitArticlePayload,
  buildInsertStatement,
  profitCandidate,
  profitCodePrefix,
  MAX_SEQUENCE_PER_PAIR,
  type ProfitArticleInput,
  type ProfitArticlePayload,
  type ProfitParam,
} from './profit-article.payload';
import { deserializarDis } from '../contabilidad/dis.utils';
import { profitDriver } from './profit-driver';

/** Contexto de auditoría corporativa (sin secretos jamás). */
export interface CorporateAuditCtx {
  userId: string;
  companyId?: string;
  requestId?: string;
  correlationId?: string;
}

export interface CompanyPlanResult {
  company: string;
  isStandard: boolean;
  items: SyncPlanItem[];
  summary: SyncPlanSummary;
}

export interface CorporateCompareResult {
  standard: string;
  companies: CompanyPlanResult[];
  executable: boolean;
}

export interface CorporateHomologateResult {
  ok: boolean;
  companies: string[];
  inserts: number;
  updates: number;
  perCompany: Array<{ company: string; inserts: number; updates: number }>;
  errorCode?: string;
  errorDetail?: string;
  rolledBack?: boolean;
}

export interface CorporateRegisterResult extends CorporateHomologateResult {
  coArt: string;
  perCompanyVerify: Array<{ company: string; verified: boolean; differences: string[] }>;
}

const ART_INSERT_COLUMNS = [
  'co_art', 'art_des', 'tipo', 'co_lin', 'co_subl', 'uni_venta', 'suni_venta',
  'tipo_imp', 'co_cat', 'co_color', 'procedenci', 'co_prov', 'tipo_cos', 'dis_cen',
  'co_us_in',
];

const ART_TRIGGERS = ['TrigI_art', 'TrigU_art', 'TrigD_art', 'TrigD_artMce'];

const norm = (v: unknown): string => String(v ?? '').trim().toUpperCase();

function check(key: PreflightCheckKey, ok: boolean, detail: string): PreflightCheck {
  return { key, ok, detail };
}

/**
 * FASE 17 — Homologación corporativa multiempresa (AD_TRANS = estándar).
 * Orquesta comparar → plan → preflight global → transacción global →
 * verificación → auditoría. Capa Application; controllers delgados.
 * Cero escrituras parciales: una empresa falla preflight o verificación →
 * cero escrituras en todas (§13, §23).
 */
@Injectable()
export class CorporateHomologationService {
  private readonly logger = new Logger(CorporateHomologationService.name);
  private typeLib: any = null;

  constructor(
    private readonly readAdapter: ProfitAdapterService,
    private readonly writeAdapter: ProfitWriteAdapterService,
    private readonly companiesService: CorporateCompaniesService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private async types(): Promise<any> {
    if (this.typeLib) return this.typeLib;
    this.typeLib = await profitDriver();
    return this.typeLib;
  }

  /** Usuario de integración (misma regla que el motor: backend-only). */
  integrationUserCode(): string {
    const code = String(this.config.get('PROFIT_INTEGRATION_USER_CODE') ?? '').trim();
    if (!/^[A-Za-z0-9]{1,6}$/.test(code)) {
      throw new BadRequestException('Usuario de integración de Profit no configurado o inexistente.');
    }
    return code;
  }

  // ---------------------------------------------------------- COMPARAR (§11)
  /** Solo lectura: difiere cada destino contra el estándar. Sin escrituras. */
  async compare(companiesRaw: unknown): Promise<CorporateCompareResult> {
    const companies = normalizeCompanyList(companiesRaw).filter((c) => c !== STANDARD_COMPANY);
    if (companies.length === 0) {
      throw new BadRequestException('Seleccione al menos una empresa destino (distinta del estándar).');
    }
    const standardRows = await this.readAllCatalogs(STANDARD_COMPANY);
    const results: CompanyPlanResult[] = [];
    for (const company of companies) {
      const items: SyncPlanItem[] = [];
      for (const key of CORPORATE_CATALOG_ORDER) {
        const desc = CORPORATE_CATALOGS[key];
        const destRows = await this.readCatalog(company, desc);
        const diffs = compareCatalogRows(desc.label, standardRows[key], destRows, {
          parentAware: !!desc.parentColumn,
        });
        for (const d of diffs) items.push(buildSyncPlanItem(d, desc));
      }
      results.push({ company, isStandard: false, items, summary: summarizePlan(items) });
    }
    const all = results.flatMap((r) => r.items);
    return { standard: STANDARD_COMPANY, companies: results, executable: isPlanExecutable(all) };
  }

  private async readCatalog(db: string, desc: CorporateCatalogDescriptor): Promise<CatalogRow[]> {
    const sql = catalogSelectForCompany(desc, db);
    const rows = await this.readAdapter.rawQuery<Record<string, string>>(sql);
    return (rows ?? []).map((r) => ({
      code: String(r['code'] ?? '').trim(),
      description: String(r['description'] ?? '').trim(),
      parent: r['parent'] !== undefined ? String(r['parent'] ?? '').trim() : undefined,
    }));
  }

  private async readAllCatalogs(db: string): Promise<Record<CorporateCatalogKey, CatalogRow[]>> {
    const out = {} as Record<CorporateCatalogKey, CatalogRow[]>;
    for (const key of CORPORATE_CATALOG_ORDER) {
      out[key] = await this.readCatalog(db, CORPORATE_CATALOGS[key]);
    }
    return out;
  }

  // --------------------------------------------------------- PREFLIGHT (§15)
  /**
   * Preflight global, solo lectura. 15 checks por empresa; un solo fallo →
   * ok=false y el llamador NO debe escribir en ninguna empresa.
   */
  async preflight(
    companiesRaw: unknown,
    opts?: { article?: ProfitArticleInput; planItems?: Array<SyncPlanItem & { company: string }>; planned?: Array<{ catalog: string; code: string; company: string }> },
  ): Promise<GlobalPreflight> {
    const requested = normalizeCompanyList(companiesRaw);
    const companies = Array.from(new Set([STANDARD_COMPANY, ...requested.filter((c) => c !== STANDARD_COMPANY)]));
    const article = opts?.article ? this.validateArticleInput(opts.article) : null;
    const candidate = article ? await this.universalCandidate(article) : null;
    const stdTrig = await this.triggerDefinition(STANDARD_COMPANY, 'TrigI_art');
    const pendingByCompany = new Map<string, Set<string>>();
    for (const item of opts?.planItems ?? []) {
      if (item.operation !== 'INSERT') continue;
      const set = pendingByCompany.get(item.company) ?? new Set<string>();
      set.add(item.catalog);
      pendingByCompany.set(item.company, set);
    }
    const checks: CompanyPreflight[] = [];
    for (const company of companies) {
      checks.push(await this.preflightCompany(company, article, candidate, stdTrig, pendingByCompany.get(company) ?? new Set(), opts?.planned ?? []));
    }
    return evaluateGlobalPreflight(checks);
  }

  private validateArticleInput(raw: ProfitArticleInput): ProfitArticleInput {
    const clean = (v: unknown): string => String(v ?? '').trim();
    const input: ProfitArticleInput = {
      description: clean(raw.description),
      articleType: clean(raw.articleType),
      groupCode: clean(raw.groupCode),
      subgroupCode: clean(raw.subgroupCode),
      unitCode: clean(raw.unitCode),
      taxType: clean(raw.taxType),
      categoryCode: clean(raw.categoryCode) || undefined,
      colorCode: clean(raw.colorCode) || undefined,
      originCode: clean(raw.originCode) || undefined,
      providerCode: clean(raw.providerCode) || undefined,
      costType: clean(raw.costType) || undefined,
      disCen: clean(raw.disCen) || undefined,
    };
    for (const [k, v] of Object.entries({
      description: input.description,
      articleType: input.articleType,
      groupCode: input.groupCode,
      subgroupCode: input.subgroupCode,
      unitCode: input.unitCode,
      taxType: input.taxType,
    })) {
      if (!v) throw new BadRequestException(`Artículo incompleto para registro corporativo: falta ${k}.`);
    }
    return input;
  }

  /** Candidato universal desde el máximo del estándar (solo lectura aquí). */
  private async universalCandidate(article: ProfitArticleInput): Promise<{ candidate: string; seq: number; prefix: string } | null> {
    const prefix = profitCodePrefix(article.groupCode, article.subgroupCode);
    if (!prefix) return null;
    const max = await this.maxSequence(STANDARD_COMPANY, prefix);
    const seq = max + 1;
    if (seq > MAX_SEQUENCE_PER_PAIR) return null;
    return { candidate: profitCandidate(prefix, seq), seq, prefix };
  }

  private async maxSequence(db: string, prefix: string): Promise<number> {
    const mssql = await this.types();
    const rows = await this.readAdapter.rawQuery<{ m: string | null }>(
      `SELECT MAX(RIGHT(LTRIM(RTRIM(co_art)), 4)) AS m FROM ${companyTableRef(db, 'art')}
       WHERE LTRIM(RTRIM(co_art)) LIKE @pfx + '[0-9][0-9][0-9][0-9]'
       AND LEN(LTRIM(RTRIM(co_art))) = LEN(@pfx) + 4`,
      { pfx: { type: mssql.VarChar(12), value: prefix } },
    );
    const m = rows[0]?.m;
    return m && /^\d+$/.test(m) ? parseInt(m, 10) : 0;
  }

  /**
   * FASE 17.1 — Lectura fiable de la definición de un trigger sobre art.
   * NO usa OBJECT_DEFINITION(OBJECT_ID(...)): OBJECT_DEFINITION resuelve el
   * ID en la base actual y puede devolver la definición de OTRO objeto con
   * el mismo ID (comprobado en Fase 17.1). Se lee sys.sql_modules de la base
   * destino con joins three-part. Solo lectura.
   */
  private async triggerDefinition(
    db: string,
    name: string,
  ): Promise<{ def: string | null; disabled: boolean }> {
    if (!/^(TrigI_art|TrigU_art|TrigD_art|TrigD_artMce)$/.test(name)) {
      throw new Error('Trigger corporativo inválido');
    }
    const safeDb = norm(db);
    const rows = await this.readAdapter.rawQuery<{ def: string | null; dis: boolean | number }>(
      `SELECT TOP 1 m.definition AS def, t.is_disabled AS dis
       FROM [${safeDb}].sys.triggers t
       JOIN [${safeDb}].sys.sql_modules m ON m.object_id = t.object_id
       WHERE t.name = @n AND t.parent_id = OBJECT_ID('[${safeDb}].dbo.art')`,
      { n: { type: (await this.types()).VarChar(60), value: name } },
    );
    const def = rows[0]?.def;
    return {
      def: typeof def === 'string' && def.trim() ? def : null,
      disabled: (rows[0]?.dis ?? false) === true || rows[0]?.dis === 1,
    };
  }

  private async preflightCompany(
    company: string,
    article: ProfitArticleInput | null,
    candidate: { candidate: string; seq: number; prefix: string } | null,
    stdTrig: { def: string | null; disabled: boolean },
    pendingInserts: Set<string>,
    planned: Array<{ catalog: string; code: string; company: string }>,
  ): Promise<CompanyPreflight> {
    const checks: PreflightCheck[] = [];
    const mssql = await this.types();

    // 1. Existe en el catálogo corporativo.
    const listed = await this.companiesService.isListed(company).catch(() => null);
    checks.push(check('IN_DIRECTORY', !!listed, listed ? `Listada en TEmpresas (${listed.name || company}).` : 'No está en AD_GRUP.dbo.TEmpresas.'));

    // 2. Nombre válido (ya normalizado; registro defensivo).
    checks.push(check('VALID_NAME', /^[A-Z0-9_]{1,30}$/.test(company), 'Formato de base válido.'));

    // 3. Conexión / base accesible (solo lectura).
    let reachable = false;
    try {
      const r = await this.readAdapter.rawQuery<{ id: number | null }>(`SELECT DB_ID(@db) AS id`, {
        db: { type: mssql.VarChar(50), value: company },
      });
      reachable = (r[0]?.id ?? null) !== null;
    } catch {
      reachable = false;
    }
    checks.push(check('CONNECTION', reachable, reachable ? 'Base accesible.' : 'Base inaccesible con la conexión actual.'));
    if (!reachable) {
      // Sin conexión, el resto no es comprobable: fallar cerrado.
      for (const k of ['SCHEMA', 'REQUIRED_TABLES', 'REQUIRED_COLUMNS', 'TRIGGERS', 'REQUIRED_CATALOGS', 'FK_DEPS', 'DEFAULTS_01_GEN', 'WRITE_PERMISSION', 'CODE_CONFLICTS', 'SEQUENCE_CONFLICT', 'DISCEN_ACCOUNTS', 'TRIGGER_COMPAT'] as PreflightCheckKey[]) {
        checks.push(check(k, false, 'No comprobable: base inaccesible.'));
      }
      return { company, ok: false, checks };
    }

    // 4. Esquema: columnas del payload + PK art_co_art.
    let schemaOk = false;
    let schemaDetail = '';
    try {
      const cols = await this.readAdapter.rawQuery<{ c: string }>(
        `SELECT LOWER(LTRIM(RTRIM(COLUMN_NAME))) AS c FROM [${company}].INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'art'`,
      );
      const have = new Set((cols ?? []).map((r) => r.c));
      const missing = ART_INSERT_COLUMNS.filter((c) => !have.has(c));
      const pk = await this.readAdapter.rawQuery<{ one: number }>(
        `SELECT 1 AS one FROM [${company}].sys.key_constraints WHERE name = 'art_co_art' AND type = 'PK'`,
      );
      schemaOk = missing.length === 0 && pk.length > 0;
      schemaDetail = schemaOk ? 'Estructura de artículo compatible.' : `Estructura incompatible (faltan: ${missing.join(', ') || 'PK art_co_art'}).`;
    } catch {
      schemaDetail = 'No se pudo leer el esquema.';
    }
    checks.push(check('SCHEMA', schemaOk, schemaDetail));

    // 5. Tablas de catálogos requeridas.
    let tablesOk = false;
    let tablesDetail = '';
    try {
      const need = CORPORATE_CATALOG_ORDER.map((k) => CORPORATE_CATALOGS[k].table);
      const rows = await this.readAdapter.rawQuery<{ t: string }>(
        `SELECT LOWER(LTRIM(RTRIM(TABLE_NAME))) AS t FROM [${company}].INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo'`,
      );
      const have = new Set((rows ?? []).map((r) => r.t));
      const missing = need.filter((t) => !have.has(t));
      tablesOk = missing.length === 0;
      tablesDetail = tablesOk ? 'Catálogos presentes.' : `Tablas faltantes: ${missing.join(', ')}.`;
    } catch {
      tablesDetail = 'No se pudo leer el catálogo de tablas.';
    }
    checks.push(check('REQUIRED_TABLES', tablesOk, tablesDetail));

    // 6. Columnas de catálogos + insertabilidad. Los NOT NULL sin default
    // solo bloquean si ese catálogo tiene INSERTs pendientes en el plan
    // (sin plan asociado, la insertabilidad se prueba dentro de la
    // transacción, que revierte ante cualquier fallo).
    let colsOk = true;
    const colsIssues: string[] = [];
    try {
      for (const key of CORPORATE_CATALOG_ORDER) {
        const desc = CORPORATE_CATALOGS[key];
        const rows = await this.readAdapter.rawQuery<{ n: string; nullable: string; def: string | null }>(
          `SELECT LOWER(LTRIM(RTRIM(COLUMN_NAME))) AS n, IS_NULLABLE AS nullable, COLUMN_DEFAULT AS def FROM [${company}].INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @t`,
          { t: { type: mssql.VarChar(60), value: desc.table } },
        );
        const byName = new Map((rows ?? []).map((r) => [r.n, r]));
        const need = [desc.codeColumn, desc.descColumn, ...(desc.parentColumn ? [desc.parentColumn] : [])];
        const missing = need.filter((c) => !byName.has(c.toLowerCase()));
        if (missing.length > 0) {
          colsOk = false;
          colsIssues.push(`${desc.table}: faltan ${missing.join(', ')}`);
          continue;
        }
        if (!pendingInserts.has(desc.label)) continue;
        const covered = new Set([...need.map((c) => c.toLowerCase()), 'co_us_in', 'rowguid', 'row_id']);
        for (const [name, col] of byName) {
          if (covered.has(name)) continue;
          if (col.nullable === 'NO' && !col.def) {
            colsOk = false;
            colsIssues.push(`${desc.table}.${name} exige dato manual`);
            break;
          }
        }
      }
    } catch {
      colsOk = false;
      colsIssues.push('no legible');
    }
    checks.push(check('REQUIRED_COLUMNS', colsOk, colsOk ? 'Columnas de catálogos compatibles.' : `Columnas incompatibles: ${colsIssues.join('; ')}.`));

    // 7. Triggers presentes.
    let trigOk = false;
    let trigDetail = '';
    try {
      const rows = await this.readAdapter.rawQuery<{ n: string }>(
        `SELECT LTRIM(RTRIM(name)) AS n FROM [${company}].sys.triggers WHERE parent_id = OBJECT_ID('[${company}].dbo.art')`,
      );
      const have = new Set((rows ?? []).map((r) => r.n));
      const missing = ART_TRIGGERS.filter((t) => !have.has(t));
      trigOk = missing.length === 0;
      trigDetail = trigOk ? 'Triggers presentes.' : `Triggers faltantes: ${missing.join(', ')}.`;
    } catch {
      trigDetail = 'No se pudieron leer los triggers.';
    }
    checks.push(check('TRIGGERS', trigOk, trigDetail));

    // 15. Compatibilidad funcional de TrigI_art con el INSERT de
    // Data-Maestra (FASE 17.1): texto idéntico o idéntico salvo citado con
    // corchetes → compatible. Trigger deshabilitado, ausente o con otra
    // lógica → bloquea (fail-closed). Jamás se deshabilita ni modifica.
    let compatOk = false;
    let compatDetail = '';
    try {
      const dest = await this.triggerDefinition(company, 'TrigI_art');
      if (!dest.def) {
        compatDetail = 'Sin validación de registro legible en destino: no se escribe.';
      } else if (!stdTrig.def) {
        compatDetail = 'Sin referencia del estándar.';
      } else if (dest.disabled) {
        compatDetail = 'Validación de registro deshabilitada en destino: posible intervención en curso, no se escribe.';
      } else {
        const r = trigInsertCompatible(stdTrig.def, dest.def);
        if (r.compatible) {
          compatOk = true;
          compatDetail = r.reason === 'IDENTICO'
            ? 'Validación de registro idéntica al estándar.'
            : 'Validación de registro equivalente al estándar.';
        } else {
          compatDetail = 'Validación de registro difiere del estándar: requiere revisión, no se escribe.';
        }
      }
    } catch {
      compatDetail = 'No se pudo comparar la validación de registro.';
    }
    checks.push(check('TRIGGER_COMPAT', compatOk, compatDetail));

    if (!article) {
      for (const [k, d] of [
        ['REQUIRED_CATALOGS', 'Sin artículo: no aplica.'],
        ['FK_DEPS', 'Sin artículo: no aplica.'],
        ['DEFAULTS_01_GEN', 'Sin artículo: no aplica.'],
        ['CODE_CONFLICTS', 'Sin artículo: no aplica.'],
        ['SEQUENCE_CONFLICT', 'Sin artículo: no aplica.'],
        ['DISCEN_ACCOUNTS', 'Sin artículo: no aplica.'],
      ] as Array<[PreflightCheckKey, string]>) {
        checks.push(check(k, true, d));
      }
    } else {
      // Payload esperado con defaults del contrato (mismos que el motor).
      const payload = this.expectedPayload('__CAND__', article);
      // 8. Catálogos requeridos por el artículo existen en destino.
      const fkCodes: Array<{ key: CorporateCatalogKey; code: string }> = [
        { key: 'lin_art', code: payload.co_lin },
        { key: 'sub_lin', code: payload.co_subl },
        { key: 'unidades', code: payload.uni_venta },
        { key: 'tabulado', code: payload.tipo_imp },
        { key: 'cat_art', code: payload.co_cat },
        { key: 'colores', code: payload.co_color },
        { key: 'proceden', code: payload.procedenci },
        { key: 'prov', code: payload.co_prov },
      ];
      let fkOk = true;
      const fkMissing: string[] = [];
      const coveredByPlan = (label: string, code: string): boolean =>
        planned.some((p) => p.company === company && p.catalog === label && norm(p.code) === norm(code));
      for (const { key, code } of fkCodes) {
        const desc = CORPORATE_CATALOGS[key];
        if (coveredByPlan(desc.label, code)) continue;
        const rows = await this.readAdapter.rawQuery<{ one: number }>(
          `SELECT 1 AS one FROM ${companyTableRef(company, desc.table)} WHERE LTRIM(RTRIM(${desc.codeColumn})) = LTRIM(RTRIM(@c))`,
          { c: { type: mssql.VarChar(30), value: code } },
        ).catch(() => []);
        if (rows.length === 0) {
          fkOk = false;
          fkMissing.push(`${desc.label} ${code}`);
        }
      }
      checks.push(check('REQUIRED_CATALOGS', fkOk, fkOk ? 'Dependencias del artículo presentes.' : `Faltan en destino (homologue primero): ${fkMissing.join(', ')}.`));

      // 9. Dependencia jerárquica sub_lin → lin_art.
      let depOk = true;
      let depDetail = 'Jerarquía línea/sublínea consistente.';
      try {
        const rows = await this.readAdapter.rawQuery<{ p: string }>(
          `SELECT LTRIM(RTRIM(co_lin)) AS p FROM ${companyTableRef(company, 'sub_lin')} WHERE LTRIM(RTRIM(co_subl)) = LTRIM(RTRIM(@s))`,
          { s: { type: mssql.VarChar(10), value: payload.co_subl } },
        ).catch(() => []);
        if (rows.length > 0 && norm(rows[0]?.p) !== norm(payload.co_lin)) {
          depOk = false;
          depDetail = `Sublínea ${payload.co_subl} pertenece a otra línea en destino.`;
        }
      } catch {
        depOk = false;
        depDetail = 'Jerarquía no comprobable.';
      }
      checks.push(check('FK_DEPS', depOk, depDetail));

      // 10. Defaults 01/GEN existen cuando el payload los usa.
      checks.push(check('DEFAULTS_01_GEN', fkOk, fkOk ? 'Códigos por defecto verificados.' : 'Códigos por defecto pendientes (ver dependencias).'));

      // 12+13. Candidato libre y secuencia válida.
      if (!candidate) {
        checks.push(check('CODE_CONFLICTS', false, 'Sin correlativo disponible (rango agotado).'));
        checks.push(check('SEQUENCE_CONFLICT', false, 'Sin correlativo disponible (rango agotado).'));
      } else {
        const exists = await this.readAdapter.rawQuery<{ one: number }>(
          `SELECT 1 AS one FROM ${companyTableRef(company, 'art')} WHERE co_art = @c`,
          { c: { type: mssql.Char(30), value: candidate.candidate } },
        ).catch(() => [{ one: 1 }]);
        checks.push(check('CODE_CONFLICTS', exists.length === 0, exists.length === 0 ? `Candidato ${candidate.candidate} libre.` : `Candidato ${candidate.candidate} ocupado.`));
        checks.push(check('SEQUENCE_CONFLICT', candidate.seq <= MAX_SEQUENCE_PER_PAIR, `Correlativo universal ${candidate.seq} (tope ${MAX_SEQUENCE_PER_PAIR}).`));
      }

      // 14. Cuentas de dis_cen existen en el contexto contable.
      let disOk = true;
      let disDetail = 'Sin distribución contable o cuentas verificadas.';
      if (payload.dis_cen) {
        try {
          const parsed = deserializarDis(payload.dis_cen);
          const codes = Object.values(parsed).filter(Boolean);
          const missing: string[] = [];
          for (const cta of codes) {
            const found = await this.readAdapter.rawQuery<{ one: number }>(
              `SELECT 1 AS one FROM [${STANDARD_ACCOUNTING_DB}].dbo.sccuenta WHERE LTRIM(RTRIM(co_cue)) = LTRIM(RTRIM(@c))`,
              { c: { type: mssql.VarChar(40), value: cta } },
            ).catch(() => []);
            if (found.length === 0) missing.push(cta);
          }
          disOk = missing.length === 0;
          disDetail = disOk ? `${codes.length} cuenta(s) verificadas.` : `Cuentas inexistentes: ${missing.join(', ')}.`;
        } catch {
          disOk = false;
          disDetail = 'Formato de distribución inválido.';
        }
      }
      checks.push(check('DISCEN_ACCOUNTS', disOk, disDetail));
    }

    // 11. Permiso de escritura del login de integración (requiere flag).
    let writeOk = false;
    let writeDetail = '';
    try {
      writeOk = await this.writeAdapter.hasInsertPermission(company);
      writeDetail = writeOk ? 'Permiso de registro confirmado.' : 'Sin permiso de escritura o flag deshabilitado.';
    } catch {
      writeDetail = 'Permiso no comprobable.';
    }
    checks.push(check('WRITE_PERMISSION', writeOk, writeDetail));

    return { company, ok: checks.every((c) => c.ok), checks };
  }

  private expectedPayload(candidate: string, article: ProfitArticleInput): ProfitArticlePayload {
    return buildProfitArticlePayload(candidate, { ...article, integrationUser: 'DM' });
  }

  // ------------------------------------------- HOMOLOGAR CATÁLOGOS (§6, §23)
  /**
   * Homologa catálogos del estándar en los destinos dentro de una
   * transacción global: comparar → plan → preflight → ejecutar → verificar.
   * Si el plan contiene bloqueos o el preflight falla: cero escrituras.
   */
  async homologate(companiesRaw: unknown, ctx: CorporateAuditCtx): Promise<CorporateHomologateResult> {
    const correlationId = ctx.correlationId ?? this.newCorrelationId();
    const requested = normalizeCompanyList(companiesRaw).filter((c) => c !== STANDARD_COMPANY);
    if (requested.length === 0) {
      throw new BadRequestException('Seleccione al menos una empresa destino (distinta del estándar).');
    }
    const compared = await this.compare(requested);
    const items = compared.companies.flatMap((r) => r.items.map((i) => ({ ...i, company: r.company })));
    await this.audit(ctx, correlationId, 'CORPORATE_COMPARE', null, {
      standard: STANDARD_COMPANY,
      companies: requested,
      executable: compared.executable,
      summary: compared.companies.map((r) => ({ company: r.company, ...r.summary })),
    });
    if (!compared.executable) {
      await this.audit(ctx, correlationId, 'CORPORATE_PLAN_BLOCKED', null, { companies: requested });
      return { ok: false, companies: requested, inserts: 0, updates: 0, perCompany: [], errorCode: 'CORPORATE_PLAN_BLOCKED', errorDetail: 'El plan contiene elementos bloqueados: requiere revisión.', rolledBack: false };
    }
    const preflight = await this.preflight(requested, { planItems: items });
    if (!preflight.ok) {
      await this.audit(ctx, correlationId, 'CORPORATE_PREFLIGHT_FAILED', null, {
        companies: requested,
        failures: preflight.companies.flatMap((c) => c.checks.filter((k) => !k.ok).map((k) => ({ company: c.company, check: k.key, detail: k.detail }))),
      });
      return { ok: false, companies: requested, inserts: 0, updates: 0, perCompany: [], errorCode: 'CORPORATE_PREFLIGHT_FAILED', errorDetail: 'Una empresa no superó la validación: no se realizó ninguna escritura.', rolledBack: false };
    }
    await this.audit(ctx, correlationId, 'CORPORATE_PREFLIGHT_OK', null, { companies: requested });
    const integrationUser = this.integrationUserCode();
    try {
      const applied = await this.writeAdapter.runInGlobalTransaction(async (tx) => {
        const stdRows = await this.readAllCatalogsTx(tx, STANDARD_COMPANY);
        return this.applyCatalogPlan(tx, stdRows, items, integrationUser);
      });
      await this.audit(ctx, correlationId, 'CORPORATE_WRITE_SUCCEEDED', null, { companies: requested, ...applied });
      return { ok: true, companies: requested, inserts: applied.inserts, updates: applied.updates, perCompany: applied.perCompany, rolledBack: false };
    } catch (e: any) {
      await this.audit(ctx, correlationId, 'CORPORATE_ROLLBACK', null, { companies: requested, error: this.safeDetail(e?.message) });
      return { ok: false, companies: requested, inserts: 0, updates: 0, perCompany: [], errorCode: 'CORPORATE_SYNC_FAILED', errorDetail: this.safeDetail(e?.message), rolledBack: true };
    }
  }

  // -------------------------------- REGISTRAR ARTÍCULO MULTIEMPRESA (§22-§24)
  /**
   * Flujo definitivo §23: seleccionar → comparar → plan → preflight global →
   * transacción (homologar + registrar + verificar) → commit/rollback.
   * Mismo código, mismo correlativo, mismo payload en todas (§17-§20).
   */
  async registerArticle(
    companiesRaw: unknown,
    articleRaw: ProfitArticleInput,
    ctx: CorporateAuditCtx,
  ): Promise<CorporateRegisterResult> {
    const correlationId = ctx.correlationId ?? this.newCorrelationId();
    const article = this.validateArticleInput(articleRaw);
    const requested = normalizeCompanyList(companiesRaw).filter((c) => c !== STANDARD_COMPANY);
    if (requested.length === 0) {
      throw new BadRequestException('Seleccione al menos una empresa destino (distinta del estándar).');
    }
    const companies = [STANDARD_COMPANY, ...requested];
    const prefix = profitCodePrefix(article.groupCode, article.subgroupCode);

    const compared = await this.compare(requested);
    const items = compared.companies.flatMap((r) => r.items.map((i) => ({ ...i, company: r.company })));
    if (!compared.executable) {
      await this.audit(ctx, correlationId, 'CORPORATE_PLAN_BLOCKED', null, { companies });
      return this.failRegister(companies, 'CORPORATE_PLAN_BLOCKED', 'Catálogos bloqueados: homologue primero o revise.');
    }
    const preflight = await this.preflight(requested, {
      article,
      planItems: items,
      planned: items.filter((i) => i.operation === 'INSERT').map((i) => ({ catalog: i.catalog, code: i.code, company: i.company })),
    });
    if (!preflight.ok) {
      await this.audit(ctx, correlationId, 'CORPORATE_PREFLIGHT_FAILED', null, {
        companies,
        failures: preflight.companies.flatMap((c) => c.checks.filter((k) => !k.ok).map((k) => ({ company: c.company, check: k.key, detail: k.detail }))),
      });
      return this.failRegister(companies, 'CORPORATE_PREFLIGHT_FAILED', 'Una empresa no superó la validación: no se realizó ninguna escritura.');
    }
    const integrationUser = this.integrationUserCode();
    try {
      const out = await this.writeAdapter.runInGlobalTransaction(async (tx) => {
        const mssql = await this.types();
        // Reserva segura del correlativo universal (§18): máximo del
        // estándar bajo UPDLOCK/HOLDLOCK + candidato libre en TODAS.
        const stdMaxRows = await tx<{ m: string | null }>(
          `SELECT MAX(RIGHT(LTRIM(RTRIM(co_art)), 4)) AS m FROM ${companyTableRef(STANDARD_COMPANY, 'art')} WITH (UPDLOCK, HOLDLOCK)
           WHERE LTRIM(RTRIM(co_art)) LIKE @pfx + '[0-9][0-9][0-9][0-9]' AND LEN(LTRIM(RTRIM(co_art))) = LEN(@pfx) + 4`,
          { pfx: { type: mssql.VarChar(12), value: prefix } },
        );
        const raw = stdMaxRows[0]?.m;
        const seq = (raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : 0) + 1;
        if (seq > MAX_SEQUENCE_PER_PAIR) throw new Error('CORPORATE_SEQUENCE_EXHAUSTED');
        const candidate = profitCandidate(prefix, seq);
        for (const company of companies) {
          const ex = await tx<{ one: number }>(
            `SELECT 1 AS one FROM ${companyTableRef(company, 'art')} WITH (UPDLOCK, HOLDLOCK) WHERE co_art = @c`,
            { c: { type: mssql.Char(30), value: candidate } },
          );
          if (ex.length > 0) throw new Error(`CORPORATE_CODE_CONFLICT:${company}`);
        }
        // Homologar dependencias necesarias dentro de la misma transacción.
        const stdRows = await this.readAllCatalogsTx(tx, STANDARD_COMPANY);
        const applied = await this.applyCatalogPlan(tx, stdRows, items, integrationUser);
        // Registrar el mismo payload en todas.
        const payload = buildProfitArticlePayload(candidate, { ...article, integrationUser });
        for (const company of companies) {
          const { sql, params } = buildInsertStatement(payload, companyTableRef(company, 'art'));
          await tx(sql, this.bindParams(params, mssql));
        }
        // Verificar valores relevantes en cada empresa ANTES del commit (§24).
        const perCompanyVerify: Array<{ company: string; verified: boolean; differences: string[] }> = [];
        for (const company of companies) {
          const rows = await tx<Record<string, string>>(
            `SELECT TOP 1 LTRIM(RTRIM(co_art)) AS co_art, LTRIM(RTRIM(art_des)) AS art_des,
              LTRIM(RTRIM(tipo)) AS tipo, LTRIM(RTRIM(co_lin)) AS co_lin, LTRIM(RTRIM(co_subl)) AS co_subl,
              LTRIM(RTRIM(uni_venta)) AS uni_venta, LTRIM(RTRIM(suni_venta)) AS suni_venta,
              LTRIM(RTRIM(tipo_imp)) AS tipo_imp, LTRIM(RTRIM(co_cat)) AS co_cat, LTRIM(RTRIM(co_color)) AS co_color,
              LTRIM(RTRIM(procedenci)) AS procedenci, LTRIM(RTRIM(co_prov)) AS co_prov,
              LTRIM(RTRIM(tipo_cos)) AS tipo_cos, LTRIM(RTRIM(CAST(ISNULL(dis_cen,'') AS VARCHAR(MAX)))) AS dis_cen,
              LTRIM(RTRIM(co_us_in)) AS co_us_in
             FROM ${companyTableRef(company, 'art')} WHERE co_art = @c`,
            { c: { type: mssql.Char(30), value: candidate } },
          );
          const differences = compareArticlePayload(rows[0] ?? null, payload as unknown as Record<string, unknown>);
          perCompanyVerify.push({ company, verified: differences.length === 0, differences });
          if (differences.length > 0) throw new Error(`CORPORATE_VERIFICATION_FAILED:${company}:${differences.join(',')}`);
        }
        return { candidate, applied, perCompanyVerify };
      });
      await this.audit(ctx, correlationId, 'CORPORATE_WRITE_SUCCEEDED', out.candidate, {
        companies,
        coArt: out.candidate,
        inserts: out.applied.inserts,
        updates: out.applied.updates,
      });
      return {
        ok: true,
        companies,
        coArt: out.candidate,
        inserts: out.applied.inserts,
        updates: out.applied.updates,
        perCompany: out.applied.perCompany,
        perCompanyVerify: out.perCompanyVerify,
        rolledBack: false,
      };
    } catch (e: any) {
      await this.audit(ctx, correlationId, 'CORPORATE_ROLLBACK', null, { companies, error: this.safeDetail(e?.message) });
      const msg = this.safeDetail(e?.message);
      const code = msg.startsWith('CORPORATE_') ? msg.split(':')[0]! : 'CORPORATE_SYNC_FAILED';
      return this.failRegister(companies, code, msg);
    }
  }

  private failRegister(companies: string[], errorCode: string, errorDetail: string): CorporateRegisterResult {
    return {
      ok: false, companies, coArt: '', inserts: 0, updates: 0, perCompany: [],
      perCompanyVerify: companies.map((company) => ({ company, verified: false, differences: [] as string[] })),
      errorCode, errorDetail, rolledBack: errorCode !== 'CORPORATE_PLAN_BLOCKED' && errorCode !== 'CORPORATE_PREFLIGHT_FAILED' ? true : false,
    };
  }

  // ------------------------------------------------------- EJECUCIÓN EN TX
  private async readAllCatalogsTx(tx: ProfitTxQuery, db: string): Promise<Record<CorporateCatalogKey, CatalogRow[]>> {
    const out = {} as Record<CorporateCatalogKey, CatalogRow[]>;
    for (const key of CORPORATE_CATALOG_ORDER) {
      const rows = await tx<Record<string, string>>(catalogSelectForCompany(CORPORATE_CATALOGS[key], db));
      out[key] = (rows ?? []).map((r) => ({
        code: String(r['code'] ?? '').trim(),
        description: String(r['description'] ?? '').trim(),
        parent: r['parent'] !== undefined ? String(r['parent'] ?? '').trim() : undefined,
      }));
    }
    return out;
  }

  private async applyCatalogPlan(
    tx: ProfitTxQuery,
    stdRows: Record<CorporateCatalogKey, CatalogRow[]>,
    items: Array<SyncPlanItem & { company: string }>,
    integrationUser: string,
  ): Promise<{ inserts: number; updates: number; perCompany: Array<{ company: string; inserts: number; updates: number }> }> {
    const mssql = await this.types();
    const stdByCatalog = new Map<string, Map<string, CatalogRow>>();
    for (const key of CORPORATE_CATALOG_ORDER) {
      const map = new Map<string, CatalogRow>();
      for (const r of stdRows[key]) {
        const code = r.code.trim();
        if (code && !map.has(code)) map.set(code, r);
      }
      stdByCatalog.set(CORPORATE_CATALOGS[key].label, map);
    }
    let inserts = 0;
    let updates = 0;
    const per = new Map<string, { inserts: number; updates: number }>();
    const bump = (company: string, kind: 'inserts' | 'updates'): void => {
      const e = per.get(company) ?? { inserts: 0, updates: 0 };
      e[kind]++;
      per.set(company, e);
      if (kind === 'inserts') inserts++;
      else updates++;
    };
    for (const item of items) {
      if (item.operation === 'NO_ACTION' || item.operation === 'BLOCKED') continue;
      const key = CORPORATE_CATALOG_ORDER.find((k) => CORPORATE_CATALOGS[k].label === item.catalog);
      if (!key) throw new Error(`CORPORATE_UNKNOWN_CATALOG:${item.catalog}`);
      const desc = CORPORATE_CATALOGS[key];
      if (item.operation === 'INSERT') {
        const std = stdByCatalog.get(item.catalog)?.get(item.code.trim());
        if (!std) throw new Error(`CORPORATE_STANDARD_ROW_MISSING:${item.catalog}:${item.code}`);
        const { sql } = catalogInsertForCompany(desc, item.company, { integrationUser });
        const params: Record<string, { type: any; value: any }> = {
          c0: { type: mssql.VarChar(60), value: std.code.trim() },
          c1: { type: mssql.VarChar(250), value: std.description.trim() },
        };
        if (desc.parentColumn) params['c2'] = { type: mssql.VarChar(10), value: (std.parent ?? '').trim() };
        if (desc.acceptsIntegrationUser) params['cu'] = { type: mssql.VarChar(10), value: integrationUser };
        await tx(sql, params);
        bump(item.company, 'inserts');
      } else {
        const sql = catalogUpdateDescForCompany(desc, item.company);
        await tx(sql, {
          c0: { type: mssql.VarChar(60), value: item.code.trim() },
          c1: { type: mssql.VarChar(250), value: item.standardValue.trim() },
        });
        bump(item.company, 'updates');
      }
    }
    return { inserts, updates, perCompany: [...per.entries()].map(([company, v]) => ({ company, ...v })) };
  }

  private bindParams(params: ProfitParam[], mssql: any): Record<string, { type: any; value: any }> {
    const bound: Record<string, { type: any; value: any }> = {};
    for (const par of params) {
      bound[par.name] = {
        type: par.kind === 'char' ? mssql.Char(par.size) : mssql.VarChar(par.size),
        value: par.value,
      };
    }
    return bound;
  }

  // ------------------------------------------------------------- AUDITORÍA
  private newCorrelationId(): string {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const rand = String(Math.floor(Math.random() * 900000) + 100000);
    return `DM-CORP-${ymd}-${rand}`;
  }

  private async audit(
    ctx: CorporateAuditCtx,
    correlationId: string,
    action: string,
    entityId: string | null,
    after: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          correlationId,
          requestId: ctx.requestId,
          actorId: ctx.userId,
          actorCompanyId: ctx.companyId,
          entityType: 'CorporateProfit',
          entityId: entityId ?? ctx.requestId ?? correlationId,
          action,
          afterData: JSON.stringify(after).slice(0, 8000),
        },
      });
    } catch (e: any) {
      this.logger.error(`Corporate audit failed (${action}): ${e?.message}`);
    }
  }

  /** Sin secretos en detalles (nunca connection strings ni passwords). */
  private safeDetail(message: unknown): string {
    return String(message ?? 'Unknown error')
      .replace(/password\s*=\s*[^; ]+/gi, 'password=***')
      .replace(/Server\s+[A-Za-z0-9_.-]+/gi, 'Server=***')
      .slice(0, 500);
  }
}
