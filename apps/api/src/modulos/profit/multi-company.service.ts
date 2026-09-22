import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ProfitAdapterService } from './profit-adapter.service';
import { ProfitWriteAdapterService } from './profit-write.adapter';
import { CorporateCompaniesService } from './corporate-companies.service';
import { CorporateHomologationService } from './corporate-homologation.service';
import { STANDARD_COMPANY, normalizeCompany } from './corporate-company';
import { companyTableRef } from './corporate-catalogs';
import { compareArticlePayload } from './corporate-compare';
import type { CompanyPreflight } from './corporate-compare';
import {
  buildProfitArticlePayload,
  buildInsertStatement,
  profitCandidate,
  profitCodePrefix,
  MAX_SEQUENCE_PER_PAIR,
  type ProfitArticleInput,
} from './profit-article.payload';
import { serializarDis } from '../contabilidad/dis.utils';
import { profitDriver } from './profit-driver';

export type CompatibilityStatus =
  | 'COMPATIBLE'
  | 'COMPATIBLE_WITH_WARNING'
  | 'INCOMPATIBLE'
  | 'DESHABILITADA';

export interface CompatibilityCheckView {
  key: string;
  ok: boolean;
  detail: string;
}

export interface CompanyCompatibility {
  company: string;
  name: string;
  isStandard: boolean;
  enabled: boolean;
  status: CompatibilityStatus;
  checks: CompatibilityCheckView[];
  blockingReasons: string[];
  warnings: string[];
  codeStatus: 'LIBRE' | 'OCUPADO' | 'SIN_CANDIDATO';
  candidate: string | null;
}

export interface CompatibilityAnalysis {
  requestId: string;
  coArt: string | null;
  description: string;
  companies: CompanyCompatibility[];
  compatibleCount: number;
  incompatibleCount: number;
  analyzedAt: string;
}

export type CompanyInsertOutcome =
  | 'INSERTADO'
  | 'YA_EXISTE'
  | 'OMITIDA_NO_COMPATIBLE'
  | 'OMITIDA_DESHABILITADA'
  | 'ERROR';

export interface CompanyInsertResult {
  company: string;
  outcome: CompanyInsertOutcome;
  coArt: string | null;
  detail: string;
  differences: string[];
}

export interface MultiInsertResult {
  requestId: string;
  coArt: string;
  ok: boolean;
  results: CompanyInsertResult[];
  errorCode?: string;
}

/**
 * FASE 25 — Analizador de compatibilidad e inserción multiempresa.
 * Reutiliza: descubrimiento TEmpresas, preflight corporativo por empresa,
 * payload 19 columnas FASE 24.2, adapters read/write, flag
 * PROFIT_WRITE_ENABLED, auditoría. No duplica matching ni workflow.
 * Escrituras solo vía writeAdapter (una operación por empresa, con
 * revalidación fresca antes de cada INSERT).
 */
@Injectable()
export class MultiCompanyService {
  private readonly logger = new Logger(MultiCompanyService.name);
  private typeLib: any = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly readAdapter: ProfitAdapterService,
    private readonly writeAdapter: ProfitWriteAdapterService,
    private readonly companies: CorporateCompaniesService,
    private readonly homologation: CorporateHomologationService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
  ) {}

  private async types(): Promise<any> {
    if (this.typeLib) return this.typeLib;
    this.typeLib = await profitDriver();
    return this.typeLib;
  }

  // ---------------------------------------------------------- configuración

  /** Empresas descubiertas + flags locales (sin hardcodear la lista). */
  async listCompanies() {
    const discovered = await this.companies.listCompanies();
    const configs = await this.prisma.profitCompanyConfig.findMany();
    const byCode = new Map(configs.map((c) => [c.code, c]));
    return discovered.map((d) => {
      const cfg = byCode.get(d.code);
      return {
        code: d.code,
        name: d.name,
        isStandard: cfg ? cfg.isStandard : d.code === STANDARD_COMPANY,
        enabled: cfg ? cfg.enabled : true,
      };
    });
  }

  async saveCompanyConfig(code: string, enabled: boolean, actorId: string) {
    const c = normalizeCompany(code);
    if (!c) throw new BadRequestException('Código de empresa inválido.');
    const listed = await this.companies.isListed(c).catch(() => null);
    if (!listed) throw new NotFoundException(`Empresa Profit desconocida: ${c}.`);
    const row = await this.prisma.profitCompanyConfig.upsert({
      where: { code: c },
      create: { code: c, enabled },
      update: { enabled },
    });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      requestId: undefined,
      actorId,
      entityType: 'ProfitCompanyConfig',
      entityId: c,
      action: 'PROFIT_COMPANY_CONFIG_SAVED',
      afterData: JSON.stringify({ code: c, enabled }),
    }).catch((e: any) => this.logger.error(`Audit failed: ${e?.message}`));
    return row;
  }

  async setStandardCompany(code: string, actorId: string) {
    const c = normalizeCompany(code);
    if (!c) throw new BadRequestException('Código de empresa inválido.');
    const listed = await this.companies.isListed(c).catch(() => null);
    if (!listed) throw new NotFoundException(`Empresa Profit desconocida: ${c}.`);
    await this.prisma.profitCompanyConfig.updateMany({ data: { isStandard: false } });
    const row = await this.prisma.profitCompanyConfig.upsert({
      where: { code: c },
      create: { code: c, enabled: true, isStandard: true },
      update: { enabled: true, isStandard: true },
    });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      requestId: undefined,
      actorId,
      entityType: 'ProfitCompanyConfig',
      entityId: c,
      action: 'PROFIT_STANDARD_COMPANY_SET',
      afterData: JSON.stringify({ code: c }),
    }).catch((e: any) => this.logger.error(`Audit failed: ${e?.message}`));
    return row;
  }

  // ---------------------------------------------------------------- entrada

  /** Input del artículo desde la solicitud (misma fuente que buildProfitInput). */
  private async buildInput(requestId: string): Promise<{ input: ProfitArticleInput; requestNumber: string }> {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      include: { requestData: true, accountingCodes: true },
    });
    if (!request) throw new NotFoundException(`Request ${requestId} not found`);
    const rd = (request as any).requestData;
    if (!rd?.groupId || !rd?.subgroupId) {
      throw new BadRequestException(`Request ${requestId} sin clasificación de grupo/subgrupo`);
    }
    const [group, subgroup, category] = await Promise.all([
      this.prisma.catalogGroup.findUnique({ where: { id: rd.groupId } }),
      this.prisma.catalogSubgroup.findUnique({ where: { id: rd.subgroupId } }),
      rd.categoryId ? this.prisma.catalogCategory.findUnique({ where: { id: rd.categoryId } }) : null,
    ]);
    if (!group || !subgroup) throw new BadRequestException(`Clasificación huérfana en request ${requestId}`);
    if (!rd.articleType || !rd.unitCode || !rd.taxType) {
      throw new BadRequestException(`Request ${requestId} sin tipo/unidad/impuesto`);
    }
    let disCen = '';
    try {
      const rec: Record<string, string> = {};
      for (const a of (request as any).accountingCodes ?? []) {
        if (a?.position && a?.code) rec[String(a.position).trim()] = String(a.code).trim();
      }
      if (Object.values(rec).some((c) => !!c)) disCen = serializarDis(rec);
    } catch {
      disCen = '';
    }
    const input: ProfitArticleInput = {
      description: (request as any).requestedDescription ?? '',
      articleType: rd.articleType,
      groupCode: (group as any).code,
      subgroupCode: (subgroup as any).code,
      unitCode: rd.unitCode,
      taxType: rd.taxType,
      categoryCode: (category as any)?.code,
      colorCode: rd.brandCode ?? undefined,
      disCen: disCen || undefined,
      model: rd.model?.trim() ? rd.model.trim() : undefined,
      ref: (rd as any).ref?.trim() ? String((rd as any).ref).trim().slice(0, 20) : undefined,
    };
    return { input, requestNumber: (request as any).requestNumber };
  }

  private integrationUserCode(): string {
    const code = String(this.config.get<string>('PROFIT_INTEGRATION_USER_CODE') ?? '').trim();
    if (!/^[A-Za-z0-9]{1,6}$/.test(code)) {
      throw new BadRequestException('Usuario de integración de Profit no configurado o inexistente.');
    }
    return code;
  }

  // -------------------------------------------------------------- análisis

  /**
   * Analiza compatibilidad por empresa (SOLO LECTURA; es el DRY RUN).
   * Mapea el preflight corporativo a COMPATIBLE/WARNING/INCOMPATIBLE.
   */
  async analyze(requestId: string, actorId?: string): Promise<CompatibilityAnalysis> {
    const { input, requestNumber } = await this.buildInput(requestId);
    const companies = await this.listCompanies();
    const prefix = profitCodePrefix(input.groupCode, input.subgroupCode);
    const stdMax = await this.maxSequence(STANDARD_COMPANY, prefix);
    const candidate = stdMax + 1 <= MAX_SEQUENCE_PER_PAIR ? profitCandidate(prefix, stdMax + 1) : null;
    const stdDescs = await this.standardCatalogDescs(input);
    const out: CompanyCompatibility[] = [];
    for (const c of companies) {
      // eslint-disable-next-line no-await-in-loop
      out.push(await this.analyzeCompany(c.code, c.name, c.isStandard, c.enabled, input, candidate, stdDescs));
    }
    const analysis: CompatibilityAnalysis = {
      requestId,
      coArt: candidate,
      description: input.description,
      companies: out,
      compatibleCount: out.filter((c) => c.status === 'COMPATIBLE' || c.status === 'COMPATIBLE_WITH_WARNING').length,
      incompatibleCount: out.filter((c) => c.status === 'INCOMPATIBLE').length,
      analyzedAt: new Date().toISOString(),
    };
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      requestId,
      actorId,
      entityType: 'ProfitCompatibilityAnalysis',
      entityId: requestId,
      action: 'PROFIT_COMPATIBILITY_ANALYZED',
      afterData: JSON.stringify({
        requestNumber,
        candidate,
        companies: out.map((c) => ({ company: c.company, status: c.status, blocking: c.blockingReasons, warnings: c.warnings })),
      }),
    }).catch((e: any) => this.logger.error(`Audit failed: ${e?.message}`));
    return analysis;
  }

  private async analyzeCompany(
    company: string,
    name: string,
    isStandard: boolean,
    enabled: boolean,
    input: ProfitArticleInput,
    candidate: string | null,
    stdDescs: Record<string, string>,
  ): Promise<CompanyCompatibility> {
    const base = {
      company, name, isStandard, enabled,
      checks: [] as CompatibilityCheckView[],
      blockingReasons: [] as string[],
      warnings: [] as string[],
      codeStatus: 'SIN_CANDIDATO' as CompanyCompatibility['codeStatus'],
      candidate,
    };
    if (!enabled) {
      return { ...base, status: 'DESHABILITADA', blockingReasons: ['Deshabilitada en Administración.'] };
    }
    let pf: CompanyPreflight;
    try {
      const global = await this.homologation.preflight([company], { article: input });
      const found = global.companies.find((c) => c.company === company);
      if (!found) throw new Error('sin resultado');
      pf = found;
    } catch (e: any) {
      return {
        ...base,
        status: 'INCOMPATIBLE',
        checks: [{ key: 'ANALYZE', ok: false, detail: 'No se pudo analizar la empresa.' }],
        blockingReasons: [`Análisis no disponible: ${String(e?.message ?? e).slice(0, 160)}`],
      };
    }
    const checks: CompatibilityCheckView[] = pf.checks.map((k) => ({ key: k.key, ok: k.ok, detail: k.detail }));
    const blockingReasons: string[] = [];
    const warnings: string[] = [];
    const BLOCKING = new Set([
      'IN_DIRECTORY', 'VALID_NAME', 'CONNECTION', 'SCHEMA', 'REQUIRED_TABLES',
      'REQUIRED_COLUMNS', 'TRIGGERS', 'TRIGGER_COMPAT', 'REQUIRED_CATALOGS',
      'FK_DEPS', 'DEFAULTS_01_GEN', 'DISCEN_ACCOUNTS', 'SEQUENCE_CONFLICT',
      'WRITE_PERMISSION',
    ]);
    for (const k of pf.checks) {
      if (k.ok) continue;
      if (k.key === 'CODE_CONFLICTS') {
        warnings.push(`El código ${candidate ?? ''} ya existe: no se insertará de nuevo.`);
        continue;
      }
      if (BLOCKING.has(k.key)) blockingReasons.push(`${k.key}: ${k.detail}`);
      else warnings.push(`${k.key}: ${k.detail}`);
    }
    // Advertencias por descripciones de catálogo distintas al estándar.
    try {
      // eslint-disable-next-line no-await-in-loop
      warnings.push(...await this.catalogDescWarnings(company, input, stdDescs));
    } catch {
      // La comparación de descripciones es informativa; no bloquea.
    }
    let codeStatus: CompanyCompatibility['codeStatus'] = candidate ? 'LIBRE' : 'SIN_CANDIDATO';
    if (candidate) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const exists = await this.articleExists(company, candidate);
        codeStatus = exists ? 'OCUPADO' : 'LIBRE';
        if (exists && !warnings.some((w) => w.includes('ya existe'))) {
          warnings.push(`El código ${candidate} ya existe: no se insertará de nuevo.`);
        }
      } catch {
        // Si no se puede comprobar, el preflight ya lo refleja.
      }
    }
    const status: CompatibilityStatus =
      blockingReasons.length > 0 ? 'INCOMPATIBLE'
        : warnings.length > 0 ? 'COMPATIBLE_WITH_WARNING'
          : 'COMPATIBLE';
    return { ...base, status, checks, blockingReasons, warnings, codeStatus };
  }

  // --------------------------------------------------------------- inserción

  /**
   * Inserta en las empresas seleccionadas (requiere flag + PROFIT.WRITE).
   * Revalida cada empresa en fresco antes de su INSERT; éxitos parciales
   * auditados por empresa (sin rollback falso).
   */
  async insertSelected(
    requestId: string,
    companiesRaw: unknown,
    user: { id: string; companyId: string },
  ): Promise<MultiInsertResult> {
    if (!this.writeAdapter.isWriteEnabled()) {
      throw new ForbiddenException('Profit write disabled by feature flag (PROFIT_WRITE_ENABLED=false)');
    }
    const selected = Array.from(new Set(
      (Array.isArray(companiesRaw) ? companiesRaw : []).map((c) => normalizeCompany(c)).filter(Boolean),
    ));
    if (selected.length === 0) throw new BadRequestException('Seleccione al menos una empresa.');
    const request = await this.prisma.request.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException(`Request ${requestId} not found`);
    if ((request as any).status !== 'CONTABILIDAD_APROBADA') {
      throw new BadRequestException(`Request ${requestId} no está en CONTABILIDAD_APROBADA`);
    }
    // SAME vinculado: reutiliza sin insertar (igual que el flujo simple).
    const link = await this.prisma.requestArticleLink.findUnique({ where: { requestId } });
    if (link && link.decision === 'SAME') {
      throw new ConflictException(`Request ${requestId} resuelta con artículo existente ${link.profitArticleCode}: no requiere inserción.`);
    }
    const correlationId = randomUUID();
    const claimed = await this.prisma.request.updateMany({
      where: { id: requestId, status: 'CONTABILIDAD_APROBADA' },
      data: { status: 'PROCESANDO_PROFIT' },
    });
    if (claimed.count === 0) {
      throw new ConflictException(`Request ${requestId} ya no está disponible para registro (PROFIT_WRITE_IN_PROGRESS)`);
    }
    const t0 = Date.now();
    try {
      const { input } = await this.buildInput(requestId);
      const integrationUser = this.integrationUserCode();
      const prefix = profitCodePrefix(input.groupCode, input.subgroupCode);
      const seq = (await this.maxSequence(STANDARD_COMPANY, prefix)) + 1;
      if (seq > MAX_SEQUENCE_PER_PAIR) throw new BadRequestException('Sin correlativo disponible.');
      const coArt = profitCandidate(prefix, seq);
      const payload = buildProfitArticlePayload(coArt, { ...input, integrationUser });
      const results: CompanyInsertResult[] = [];
      for (const company of selected) {
        // eslint-disable-next-line no-await-in-loop
        results.push(await this.insertOneCompany(company, payload, requestId, user.id));
      }
      const failed = results.filter((r) => r.outcome === 'ERROR');
      // Éxito solo si cada empresa seleccionada terminó INSERTADA o YA_EXISTE.
      // Una omisión (incompatible/deshabilitada) no es éxito: debe auditarse
      // como parcial y nunca afirmarse "todo registrado".
      const done = results.filter((r) => r.outcome === 'INSERTADO' || r.outcome === 'YA_EXISTE');
      const ok = failed.length === 0 && done.length === results.length;
      await this.prisma.request.update({
        where: { id: requestId },
        data: { status: ok ? 'INSERTADO_PROFIT' : 'ERROR_PROFIT' },
      });
      if (done.length > 0) {
        await this.prisma.requestData.update({ where: { requestId }, data: { profitCode: coArt } });
      }
      await this.auditoria.logEvent({
        correlationId,
        requestId,
        actorId: user.id,
        entityType: 'ProfitMultiInsert',
        entityId: requestId,
        action: ok ? 'PROFIT_MULTI_INSERT_SUCCEEDED' : 'PROFIT_MULTI_INSERT_PARTIAL',
        afterData: JSON.stringify({
          coArt, companies: selected, results, durationMs: Date.now() - t0,
        }),
      }).catch((e: any) => this.logger.error(`Audit failed: ${e?.message}`));
      return {
        requestId, coArt, ok, results,
        errorCode: ok ? undefined : 'PROFIT_MULTI_INSERT_PARTIAL',
      };
    } catch (e: any) {
      await this.prisma.request.update({ where: { id: requestId }, data: { status: 'ERROR_PROFIT' } });
      await this.auditoria.logEvent({
        correlationId, requestId, actorId: user.id,
        entityType: 'ProfitMultiInsert', entityId: requestId,
        action: 'PROFIT_MULTI_INSERT_FAILED',
        afterData: JSON.stringify({ error: String(e?.message ?? e).slice(0, 300) }),
      }).catch((err: any) => this.logger.error(`Audit failed: ${err?.message}`));
      throw e;
    }
  }

  /** Inserción en UNA empresa con revalidación fresca (sin asumir el análisis). */
  private async insertOneCompany(
    company: string,
    payload: ReturnType<typeof buildProfitArticlePayload>,
    requestId: string,
    actorId: string,
  ): Promise<CompanyInsertResult> {
    const coArt = payload.co_art;
    const done = (outcome: CompanyInsertOutcome, detail: string, differences: string[] = []): CompanyInsertResult => {
      void this.auditoria.logEvent({
        correlationId: randomUUID(), requestId, actorId,
        entityType: 'ProfitMultiInsert', entityId: `${requestId}:${company}`,
        action: 'PROFIT_COMPANY_INSERT_RESULT',
        afterData: JSON.stringify({ company, outcome, coArt, detail }),
      }).catch((e: any) => this.logger.error(`Audit failed: ${e?.message}`));
      return { company, outcome, coArt, detail, differences };
    };
    // 1. Config local.
    const cfg = await this.prisma.profitCompanyConfig.findUnique({ where: { code: company } }).catch(() => null);
    if (cfg && !cfg.enabled) return done('OMITIDA_DESHABILITADA', 'Deshabilitada en Administración.');
    // 2. Revalidación fresca de dependencias críticas.
    let input: ProfitArticleInput;
    try {
      input = (await this.buildInput(requestId)).input;
    } catch (e: any) {
      return done('ERROR', `Revalidación: ${String(e?.message ?? e).slice(0, 200)}`);
    }
    try {
      const global = await this.homologation.preflight([company], { article: input });
      const pf = global.companies.find((c) => c.company === company);
      const bad = (pf?.checks ?? []).filter((k) => !k.ok && k.key !== 'CODE_CONFLICTS' && k.key !== 'WRITE_PERMISSION');
      if (!pf || bad.length > 0) {
        return done('OMITIDA_NO_COMPATIBLE', `La empresa ya no cumple: ${bad.map((k) => k.key).join(', ') || 'sin resultado'}. No se realizó la inserción.`);
      }
    } catch (e: any) {
      return done('ERROR', `Revalidación no disponible: ${String(e?.message ?? e).slice(0, 200)}`);
    }
    // 3. Idempotencia: si ya existe, no hay INSERT.
    try {
      if (await this.articleExists(company, coArt)) {
        return done('YA_EXISTE', `El artículo ${coArt} ya existe. No se realizó INSERT.`);
      }
    } catch (e: any) {
      return done('ERROR', `Existencia no comprobable: ${String(e?.message ?? e).slice(0, 200)}`);
    }
    // 4. INSERT + verificación (una operación, su propia conexión).
    try {
      const mssql = await this.types();
      const { sql, params } = buildInsertStatement(payload, companyTableRef(company, 'art'));
      const bound: Record<string, { type: any; value: any }> = {};
      for (const par of params) {
        bound[par.name] = { type: par.kind === 'char' ? mssql.Char(par.size) : mssql.VarChar(par.size), value: par.value };
      }
      await this.writeAdapter.runInGlobalTransaction(async (tx) => {
        await tx(sql, bound);
      });
    } catch (e: any) {
      if (e instanceof ForbiddenException || e instanceof ServiceUnavailableException) throw e;
      return done('ERROR', `INSERT fallido: ${String(e?.message ?? e).slice(0, 200)}`);
    }
    // 5. Verificación de lectura en la misma empresa.
    try {
      const rows = await this.readAdapter.rawQuery<Record<string, string>>(
        `SELECT TOP 1 LTRIM(RTRIM(co_art)) AS co_art, LTRIM(RTRIM(art_des)) AS art_des,
          LTRIM(RTRIM(tipo)) AS tipo, LTRIM(RTRIM(co_lin)) AS co_lin, LTRIM(RTRIM(co_subl)) AS co_subl,
          LTRIM(RTRIM(uni_venta)) AS uni_venta, LTRIM(RTRIM(suni_venta)) AS suni_venta,
          LTRIM(RTRIM(tipo_imp)) AS tipo_imp, LTRIM(RTRIM(co_cat)) AS co_cat, LTRIM(RTRIM(co_color)) AS co_color,
          LTRIM(RTRIM(procedenci)) AS procedenci, LTRIM(RTRIM(co_prov)) AS co_prov,
          LTRIM(RTRIM(tipo_cos)) AS tipo_cos, LTRIM(RTRIM(CAST(ISNULL(dis_cen,'') AS VARCHAR(MAX)))) AS dis_cen,
          LTRIM(RTRIM(co_us_in)) AS co_us_in, LTRIM(RTRIM(co_sucu)) AS co_sucu,
          LTRIM(RTRIM(uni_compra)) AS uni_compra, LTRIM(RTRIM(modelo)) AS modelo, LTRIM(RTRIM(ref)) AS ref
         FROM ${companyTableRef(company, 'art')} WHERE co_art = @c`,
        { c: { type: (await this.types()).Char(30), value: coArt.trim() } },
      );
      const differences = compareArticlePayload(rows[0] ?? null, payload as unknown as Record<string, unknown>);
      // dis_cen con formato distinto pero mismo contenido no bloquea (igual que VERIFY simple).
      if (differences.length > 0) {
        return done('ERROR', `Verificación con diferencias: ${differences.join(', ')}.`);
      }
      return done('INSERTADO', 'Insertado y verificado correctamente.');
    } catch (e: any) {
      return done('ERROR', `Verificación no disponible: ${String(e?.message ?? e).slice(0, 200)}`);
    }
  }

  // ---------------------------------------------------------------- apoyo

  private async maxSequence(db: string, prefix: string): Promise<number> {
    const mssql = await this.types();
    const rows = await this.readAdapter.rawQuery<{ m: string | null }>(
      `SELECT MAX(RIGHT(LTRIM(RTRIM(co_art)), 4)) AS m FROM ${companyTableRef(db, 'art')}
       WHERE LTRIM(RTRIM(co_art)) LIKE @pfx + '[0-9][0-9][0-9][0-9]'
       AND LEN(LTRIM(RTRIM(co_art))) = LEN(@pfx) + 4`,
      { pfx: { type: mssql.VarChar(12), value: prefix } },
    ).catch(() => [] as Array<{ m: string | null }>);
    const m = rows[0]?.m;
    return m && /^\d+$/.test(m) ? parseInt(m, 10) : 0;
  }

  private async articleExists(db: string, coArt: string): Promise<boolean> {
    const rows = await this.readAdapter.rawQuery<{ one: number }>(
      `SELECT 1 AS one FROM ${companyTableRef(db, 'art')} WHERE co_art = @c`,
      { c: { type: (await this.types()).Char(30), value: coArt.trim() } },
    );
    return rows.length > 0;
  }

  /** Descripciones estándar para advertencias por diferencia (no bloquean). */
  private async standardCatalogDescs(input: ProfitArticleInput): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const get = async (sqlText: string, params: Record<string, { type: any; value: any }>): Promise<string> => {
      try {
        const rows = await this.readAdapter.rawQuery<{ d: string }>(sqlText, params);
        return String(rows[0]?.d ?? '').trim();
      } catch {
        return '';
      }
    };
    const mssql = await this.types();
    const V = (v: string, n: number) => ({ type: mssql.VarChar(n), value: v });
    out.lin = await get(
      `SELECT TOP 1 LTRIM(RTRIM(lin_des)) AS d FROM ${companyTableRef(STANDARD_COMPANY, 'lin_art')} WHERE LTRIM(RTRIM(co_lin)) = LTRIM(RTRIM(@c))`,
      { c: V(input.groupCode, 10) },
    );
    out.sub = await get(
      `SELECT TOP 1 LTRIM(RTRIM(subl_des)) AS d FROM ${companyTableRef(STANDARD_COMPANY, 'sub_lin')} WHERE LTRIM(RTRIM(co_subl)) = LTRIM(RTRIM(@c))`,
      { c: V(input.subgroupCode, 10) },
    );
    out.uni = await get(
      `SELECT TOP 1 LTRIM(RTRIM(des_uni)) AS d FROM ${companyTableRef(STANDARD_COMPANY, 'unidades')} WHERE LTRIM(RTRIM(co_uni)) = LTRIM(RTRIM(@c))`,
      { c: V(input.unitCode, 10) },
    );
    return out;
  }

  private async catalogDescWarnings(
    company: string,
    input: ProfitArticleInput,
    std: Record<string, string>,
  ): Promise<string[]> {
    const warnings: string[] = [];
    const get = async (table: string, codeCol: string, desCol: string, code: string): Promise<string> => {
      try {
        const rows = await this.readAdapter.rawQuery<{ d: string }>(
          `SELECT TOP 1 LTRIM(RTRIM(${desCol})) AS d FROM ${companyTableRef(company, table)} WHERE LTRIM(RTRIM(${codeCol})) = LTRIM(RTRIM(@c))`,
          { c: { type: (await this.types()).VarChar(10), value: code } },
        );
        return String(rows[0]?.d ?? '').trim();
      } catch {
        return '';
      }
    };
    const pairs: Array<[string, string, string, string, string]> = [
      ['Grupo', 'lin_art', 'co_lin', 'lin_des', input.groupCode],
      ['Subgrupo', 'sub_lin', 'co_subl', 'subl_des', input.subgroupCode],
      ['Unidad', 'unidades', 'co_uni', 'des_uni', input.unitCode],
    ];
    const stdMap: Record<string, string> = { Grupo: std.lin ?? '', Subgrupo: std.sub ?? '', Unidad: std.uni ?? '' };
    for (const [label, table, codeCol, desCol, code] of pairs) {
      if (!code) continue;
      // eslint-disable-next-line no-await-in-loop
      const got = await get(table, codeCol, desCol, code);
      const want = stdMap[label] ?? '';
      if (got && want && got.toUpperCase() !== want.toUpperCase()) {
        warnings.push(`${label} ${code}: descripción distinta al estándar ("${want}" vs "${got}").`);
      }
    }
    return warnings;
  }
}

