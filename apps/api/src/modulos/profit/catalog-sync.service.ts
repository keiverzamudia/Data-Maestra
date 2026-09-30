import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ProfitAdapterService } from './profit-adapter.service';
import { ProfitWriteAdapterService } from './profit-write.adapter';
import { CorporateCompaniesService } from './corporate-companies.service';
import { STANDARD_COMPANY } from './corporate-company';
import {
  CORPORATE_CATALOGS,
  CORPORATE_CATALOG_ORDER,
  catalogSelectForCompany,
  catalogInsertForCompany,
  type CatalogRow,
  type CorporateCatalogKey,
} from './corporate-catalogs';
import { profitDriver } from './profit-driver';
import { bindProfitParams, type ProfitParam } from './profit-article.payload';
import type { ProfitArticleInput } from './profit-article.payload';

export type ProposalStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';
export type ProposalReason = 'FALTA' | 'CONFLICTO';
export type LineState = 'IGUAL' | 'FALTA' | 'CONFLICTO' | 'RESUELTO' | 'CREADO';

/** Ancho máximo de los códigos de catálogo en Profit (char(6) en AD_TRANS). */
const MAX_CODE_LEN = 6;

/**
 * Catálogos que un artículo realmente necesita. `prov` y `proceden` quedan
 * fuera porque son voluminosos y el artículo siempre usa los códigos fijos
 * GEN / 01: incluirlos solo genera ruido.
 */
export const DEFAULT_CATALOGS: CorporateCatalogKey[] = [
  'tabulado',
  'unidades',
  'lin_art',
  'sub_lin',
  'cat_art',
  'colores',
];
export const PROVIDER_CATALOGS: CorporateCatalogKey[] = ['prov', 'proceden'];

export interface CatalogDiffLine {
  catalogKey: CorporateCatalogKey;
  catalogLabel: string;
  masterCode: string;
  masterDescription: string;
  state: LineState;
  localExistingCode: string | null;
  localExistingDescription: string | null;
  proposedCode: string | null;
  detail: string;
}

export interface CatalogCount {
  key: CorporateCatalogKey;
  label: string;
  iguales: number;
  faltantes: number;
  conflictos: number;
  resueltos: number;
  creados: number;
  total: number;
  /** Pendientes de decisión humana (solo conflictos). */
  pending: number;
}

export interface CompanyCatalogReport {
  company: string;
  name: string;
  isStandard: boolean;
  counts: { iguales: number; faltantes: number; conflictos: number; resueltos: number; creados: number };
  catalogs: CatalogCount[];
  /** Solo la página de problemas pedida (IGUALES no se envían). */
  lines: CatalogDiffLine[];
  totalProblems: number;
  offset: number;
  limit: number;
}

export interface CatalogAnalysisResult {
  standard: string;
  masterTotal: number;
  catalogs: CorporateCatalogKey[];
  companies: CompanyCatalogReport[];
  pendingProposals: number;
  autoCreated: number;
  analyzedAt: string;
}

export interface AnalyzeOptions {
  company?: string;
  catalogs?: string[];
  includeProviders?: boolean;
  autoCreate?: boolean;
  limit?: number;
  offset?: number;
  catalog?: string;
}

export interface ProposalView {
  id: string;
  catalogKey: string;
  catalogLabel: string;
  companyCode: string;
  masterCode: string;
  masterDescription: string;
  localCode: string;
  reason: ProposalReason;
  detail: string;
  status: ProposalStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

const up = (v: unknown): string => String(v ?? '').trim().toUpperCase();
const normDesc = (v: unknown): string => String(v ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
const emptyCounts = () => ({ iguales: 0, faltantes: 0, conflictos: 0, resueltos: 0, creados: 0 });

/**
 * FASE 27 — MANEJO MULTIEMPRESA.
 *
 * Integra los catálogos del maestro (AD_TRANS) hacia el resto de empresas de
 * `TEmpresas` siguiendo reglas estrictas:
 *
 *  1. Si ya existe un vínculo confirmado → el elemento está resuelto.
 *  2. Si el código del maestro NO existe en destino → es un faltante: se crea
 *     solo (INSERT de una fila que no existía; nunca se toca nada existente).
 *  3. Si el código del maestro existe con OTRO significado → NUNCA se borra ni
 *     se renombra: se propone un código nuevo (COM1, COM2…) y **una persona lo
 *     confirma**. Nada se aplica solo.
 *  4. Confirmar = crear el elemento en esa empresa + registrar el vínculo.
 *  5. Sin cobertura resuelta, el artículo NO se escribe en esa empresa
 *     (fail-closed); el resto de empresas sigue su curso.
 */
@Injectable()
export class CatalogSyncService {
  private readonly logger = new Logger(CatalogSyncService.name);
  private typeLib: any = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly readAdapter: ProfitAdapterService,
    private readonly writeAdapter: ProfitWriteAdapterService,
    private readonly companies: CorporateCompaniesService,
    private readonly auditoria: AuditoriaService,
    private readonly config: ConfigService,
  ) {}

  private async types(): Promise<any> {
    if (this.typeLib) return this.typeLib;
    this.typeLib = await profitDriver();
    return this.typeLib;
  }

  private integrationUser(): string {
    const code = String(this.config.get('PROFIT_INTEGRATION_USER_CODE') ?? '').trim();
    if (!/^[A-Za-z0-9]{1,6}$/.test(code)) {
      throw new BadRequestException('Usuario de integración de Profit no configurado.');
    }
    return code;
  }

  /** Catálogos efectivos según los filtros recibidos. */
  private selectedCatalogs(opts: AnalyzeOptions): CorporateCatalogKey[] {
    const valid = CORPORATE_CATALOG_ORDER;
    if (opts.catalog) {
      if (!valid.includes(opts.catalog as CorporateCatalogKey)) {
        throw new BadRequestException(`Catálogo indicado no es válido: ${opts.catalog}`);
      }
      return [opts.catalog as CorporateCatalogKey];
    }
    if (opts.catalogs?.length) {
      const picked = opts.catalogs.filter((k) => valid.includes(k as CorporateCatalogKey)) as CorporateCatalogKey[];
      if (!picked.length) throw new BadRequestException('Catálogo indicado no es válido.');
      return CORPORATE_CATALOG_ORDER.filter((k) => picked.includes(k));
    }
    const base = opts.includeProviders ? [...DEFAULT_CATALOGS, ...PROVIDER_CATALOGS] : [...DEFAULT_CATALOGS];
    return CORPORATE_CATALOG_ORDER.filter((k) => base.includes(k));
  }

  // ------------------------------------------------------------- lectura

  /** Lee un catálogo de una empresa (solo lectura). */
  private async readCatalog(company: string, key: CorporateCatalogKey): Promise<CatalogRow[]> {
    const sql = catalogSelectForCompany(CORPORATE_CATALOGS[key], company);
    const rows = await this.readAdapter.rawQuery<Record<string, string>>(sql);
    return (rows ?? []).map((r) => ({
      code: String(r['code'] ?? '').trim(),
      description: String(r['description'] ?? '').trim(),
      parent: r['parent'] !== undefined ? String(r['parent'] ?? '').trim() : undefined,
    }));
  }

  // ------------------------------------------------- 1. catálogo maestro

  /**
   * Copia el catálogo del maestro (AD_TRANS) a la base local. Solo LECTURA en
   * Profit. Idempotente.
   */
  async syncMaster(): Promise<{ total: number; byCatalog: Record<string, number> }> {
    const byCatalog: Record<string, number> = {};
    for (const key of CORPORATE_CATALOG_ORDER) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await this.readCatalog(STANDARD_COMPANY, key);
      byCatalog[key] = rows.length;
      for (const r of rows) {
        if (!r.code) continue;
        // eslint-disable-next-line no-await-in-loop
        await this.prisma.masterCatalogEntry.upsert({
          where: { catalogKey_code: { catalogKey: key, code: r.code } },
          create: { catalogKey: key, code: r.code, description: r.description, parentCode: r.parent ? r.parent : null },
          update: { description: r.description, parentCode: r.parent ? r.parent : null, active: true },
        });
      }
    }
    const total = await this.prisma.masterCatalogEntry.count({ where: { active: true } });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      entityType: 'MasterCatalogEntry',
      entityId: 'MASTER',
      action: 'MULTIEMPRESA_MASTER_SYNC',
      afterData: JSON.stringify({ standard: STANDARD_COMPANY, total, byCatalog }),
    }).catch((e: any) => this.logger.error(`Audit failed: ${e?.message}`));
    return { total, byCatalog };
  }

  async masterCount(): Promise<number> {
    return this.prisma.masterCatalogEntry.count({ where: { active: true } });
  }

  async masterList(catalogKey?: string): Promise<Array<{ catalogKey: string; code: string; description: string; parentCode: string | null }>> {
    const rows = await this.prisma.masterCatalogEntry.findMany({
      where: { active: true, ...(catalogKey ? { catalogKey } : {}) },
      orderBy: [{ catalogKey: 'asc' }, { code: 'asc' }],
    });
    return rows.map((r) => ({ catalogKey: r.catalogKey, code: r.code, description: r.description, parentCode: r.parentCode }));
  }

  /** Genera el siguiente código libre: base + 1, 2, 3… (COM → COM1). */
  private nextFreeCode(base: string, taken: Set<string>): string {
    const b = String(base ?? '').trim();
    for (let n = 1; n <= 99; n += 1) {
      const suffix = String(n);
      const candidate = (b.length + suffix.length > MAX_CODE_LEN
        ? `${b.slice(0, MAX_CODE_LEN - suffix.length)}${suffix}`
        : `${b}${suffix}`).toUpperCase();
      if (!taken.has(candidate)) return candidate;
    }
    throw new BadRequestException(`No hay código libre para "${base}" en el catálogo.`);
  }

  /**
   * Crea UN elemento de catálogo en la empresa destino. Solo inserta: el
   * llamador ya verificó que el código no existe. Transacción global.
   */
  private async createElement(
    company: string,
    key: CorporateCatalogKey,
    code: string,
    description: string,
    parent: string | undefined,
  ): Promise<void> {
    const desc = CORPORATE_CATALOGS[key];
    const mssql = await this.types();
    const integrationUser = this.integrationUser();
    const { sql, params } = catalogInsertForCompany(desc, company, {
      ...(desc.acceptsIntegrationUser ? { integrationUser } : {}),
    });
    const size: Record<string, number> = { c0: 30, c1: 120, c2: 6, cu: 6 };
    const values: Record<string, string> = { c0: code, c1: description, c2: parent ?? '', cu: integrationUser };
    const boundParams: ProfitParam[] = params.map((name) => ({ name, kind: 'char', size: size[name] ?? 30, value: values[name] ?? '' }));
    await this.writeAdapter.runInGlobalTransaction(async (tx) => {
      await tx(sql, bindProfitParams(mssql, boundParams));
    });
  }

  /** Registra el vínculo maestro ↔ empresa. */
  private async saveLink(
    key: CorporateCatalogKey,
    company: string,
    masterCode: string,
    localCode: string,
    note: string | undefined,
    actorId: string,
  ): Promise<void> {
    await this.prisma.companyCatalogCode.upsert({
      where: { catalogKey_companyCode_masterCode: { catalogKey: key, companyCode: company, masterCode } },
      create: { catalogKey: key, companyCode: company, masterCode, localCode, origin: localCode === masterCode ? 'MASTER' : 'LOCAL_NEW', note, createdBy: actorId },
      update: { localCode, active: true, note, createdBy: actorId },
    });
  }

  // -------------------------------------------- 2. analizar y proponer

  /**
   * Compara el maestro contra las empresas. Por defecto procesa SOLO los
   * catálogos que usa un artículo y devuelve contadores por empresa y por
   * catálogo, más UNA página de problemas (nunca la lista completa).
   *
   * - Faltantes: si `autoCreate` y la escritura está habilitada, se crean
   *   solos (INSERT de filas que no existían).
   * - Conflictos: generan propuesta PENDING; requieren confirmación humana.
   */
  async analyze(actorId?: string, opts: AnalyzeOptions = {}): Promise<CatalogAnalysisResult> {
    const catalogs = this.selectedCatalogs(opts);
    const masterTotal = await this.masterCount();
    if (masterTotal === 0) {
      throw new BadRequestException('Sincronice primero el catálogo maestro (AD_TRANS).');
    }
    const autoCreate = opts.autoCreate === true && this.writeAdapter.isWriteEnabled();
    const limit = Math.min(Math.max(Number(opts.limit ?? 20) || 20, 1), 200);
    const offset = Math.max(Number(opts.offset ?? 0) || 0, 0);

    const masterRows = await this.prisma.masterCatalogEntry.findMany({
      where: { active: true, catalogKey: { in: catalogs as string[] } },
    });
    const mapped = await this.prisma.companyCatalogCode.findMany({ where: { active: true } });
    const pendingAll = await this.prisma.companyCatalogProposal.count({ where: { status: 'PENDING' } });
    const pendingByKey = new Map<string, number>();
    const pendingRows = await this.prisma.companyCatalogProposal.findMany({ where: { status: 'PENDING' }, select: { companyCode: true, catalogKey: true } });
    for (const p of pendingRows) {
      const k = `${p.companyCode}|${p.catalogKey}`;
      pendingByKey.set(k, (pendingByKey.get(k) ?? 0) + 1);
    }

    const list = (await this.companies.listCompanies())
      .filter((c) => (opts.company ? c.code === up(opts.company) : true));

    const reports: CompanyCatalogReport[] = [];
    let autoCreated = 0;

    for (const c of list) {
      if (c.code === STANDARD_COMPANY) {
        reports.push({
          company: c.code, name: c.name, isStandard: true,
          counts: emptyCounts(), catalogs: [], lines: [], totalProblems: 0, offset: 0, limit,
        });
        continue;
      }
      const company = c.code;
      const companyLines: CatalogDiffLine[] = [];
      const counts = emptyCounts();
      const catalogCounts: CatalogCount[] = [];

      for (const key of catalogs) {
        const desc = CORPORATE_CATALOGS[key];
        // eslint-disable-next-line no-await-in-loop
        const master = masterRows.filter((m) => m.catalogKey === key);
        if (!master.length) continue;
        // eslint-disable-next-line no-await-in-loop
        const dest = await this.readCatalog(company, key);
        const cc = { key, label: desc.label, ...emptyCounts(), total: master.length, pending: 0 };
        const index = new Map<string, CatalogRow>();
        const used = new Set<string>();
        for (const r of dest) {
          index.set(desc.parentColumn ? `${up(r.parent ?? '')}|${up(r.code)}` : up(r.code), r);
          used.add(up(r.code));
        }
        const parentLocal = (parentMaster: string | null | undefined): string | null => {
          if (!parentMaster || !desc.parentCatalog) return null;
          const hit = mapped.find(
            (r) => r.catalogKey === desc.parentCatalog && r.companyCode === company && up(r.masterCode) === up(parentMaster!),
          );
          return hit ? hit.localCode : up(parentMaster!);
        };

        for (const m of master) {
          const mcode = up(m.code);
          const pLocal = parentLocal(m.parentCode);
          const found = index.get(desc.parentColumn ? `${pLocal ?? ''}|${mcode}` : mcode);
          const hasLink = mapped.some((r) => r.catalogKey === key && r.companyCode === company && up(r.masterCode) === mcode);
          const base = { catalogKey: key, catalogLabel: desc.label, masterCode: mcode, masterDescription: m.description };

          if (hasLink) {
            cc.resueltos += 1; counts.resueltos += 1;
            continue;
          }
          if (!found) {
            const free = !used.has(mcode);
            if (autoCreate && free) {
              // Faltante: se crea solo. Nunca se toca una fila existente.
              // eslint-disable-next-line no-await-in-loop
              await this.createElement(company, key, mcode, m.description, pLocal ?? undefined);
              // eslint-disable-next-line no-await-in-loop
              await this.saveLink(key, company, mcode, mcode, 'Creado automáticamente por Manejo Multiempresa', actorId ?? 'SYSTEM');
              used.add(mcode);
              cc.creados += 1; counts.creados += 1; autoCreated += 1;
              companyLines.push({
                ...base, state: 'CREADO', localExistingCode: null, localExistingDescription: null,
                proposedCode: mcode, detail: 'No existía en esta empresa: se creó con el código del maestro.',
              });
              continue;
            }
            cc.faltantes += 1; counts.faltantes += 1;
            companyLines.push({
              ...base, state: 'FALTA', localExistingCode: null, localExistingDescription: null,
              proposedCode: mcode, detail: 'No existe en esta empresa. Se creará con el código del maestro.',
            });
            // eslint-disable-next-line no-await-in-loop
            await this.ensureProposal(key, company, mcode, m.description, mcode, 'FALTA', 'No existe en esta empresa; se creará con el código del maestro.');
            continue;
          }
          if (normDesc(found.description) === normDesc(m.description)) {
            cc.iguales += 1; counts.iguales += 1;
            continue;
          }
          // CONFLICTO: mismo código, otro significado. No se toca lo existente.
          const proposal = this.nextFreeCode(mcode, used);
          used.add(up(proposal));
          cc.conflictos += 1; counts.conflictos += 1;
          companyLines.push({
            ...base, state: 'CONFLICTO', localExistingCode: found.code, localExistingDescription: found.description,
            proposedCode: proposal,
            detail: `El código ${found.code} ya existe con otra descripción ("${found.description}"). Se propone crear ${proposal} sin tocar la fila existente.`,
          });
          // eslint-disable-next-line no-await-in-loop
          await this.ensureProposal(
            key, company, mcode, m.description, proposal, 'CONFLICTO',
            `El código ${found.code} ya existe con otra descripción ("${found.description}").`,
          );
        }
        cc.pending = pendingByKey.get(`${company}|${key}`) ?? 0;
        catalogCounts.push(cc);
      }

      const page = companyLines.slice(offset, offset + limit);
      reports.push({
        company, name: c.name, isStandard: false, counts,
        catalogs: catalogCounts, lines: page, totalProblems: companyLines.length, offset, limit,
      });
    }

    const pending = await this.prisma.companyCatalogProposal.count({ where: { status: 'PENDING' } });
    const result: CatalogAnalysisResult = {
      standard: STANDARD_COMPANY,
      masterTotal,
      catalogs,
      companies: reports,
      pendingProposals: pending || pendingAll,
      autoCreated,
      analyzedAt: new Date().toISOString(),
    };
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      entityType: 'CatalogAnalysis',
      entityId: 'ANALISIS',
      action: 'MULTIEMPRESA_CATALOG_ANALYZED',
      afterData: JSON.stringify({
        catalogs, autoCreate, autoCreated,
        companies: reports.map((r) => ({ company: r.company, ...r.counts, problems: r.totalProblems })),
        pending,
      }),
    }).catch((e: any) => this.logger.error(`Audit failed: ${e?.message}`));
    if (autoCreated > 0) {
      await this.auditoria.logEvent({
        correlationId: randomUUID(),
        actorId,
        entityType: 'MasterCatalogEntry',
        entityId: 'AUTO_CREATE',
        action: 'MULTIEMPRESA_CATALOG_AUTO_CREATED',
        afterData: JSON.stringify({ autoCreated, catalogs }),
      }).catch((e: any) => this.logger.error(`Audit failed: ${e?.message}`));
    }
    return result;
  }

  /** Crea la propuesta PENDING si no hay una equivalente ya abierta. */
  private async ensureProposal(
    catalogKey: string,
    companyCode: string,
    masterCode: string,
    masterDescription: string,
    localCode: string,
    reason: ProposalReason,
    detail: string,
  ): Promise<number> {
    const existing = await this.prisma.companyCatalogProposal.findFirst({
      where: { catalogKey, companyCode, masterCode: up(masterCode), status: 'PENDING' },
    });
    if (existing) {
      if (existing.localCode !== up(localCode)) {
        await this.prisma.companyCatalogProposal.update({ where: { id: existing.id }, data: { localCode: up(localCode), detail } });
        return 1;
      }
      return 0;
    }
    await this.prisma.companyCatalogProposal.create({
      data: { catalogKey, companyCode, masterCode: up(masterCode), masterDescription, localCode: up(localCode), reason, detail },
    });
    return 1;
  }

  // ------------------------------------------- 3. confirmación humana

  async proposals(company?: string, catalog?: string): Promise<ProposalView[]> {
    const rows = await this.prisma.companyCatalogProposal.findMany({
      where: {
        ...(company ? { companyCode: up(company) } : {}),
        ...(catalog ? { catalogKey: catalog } : {}),
      },
      orderBy: [{ status: 'asc' }, { companyCode: 'asc' }, { catalogKey: 'asc' }, { masterCode: 'asc' }],
    });
    return rows.map((r) => this.toView(r));
  }

  /** Pendientes agrupados por empresa y catálogo (alimenta las pestañas). */
  async proposalCounts(): Promise<Array<{ companyCode: string; catalogKey: string; catalogLabel: string; pending: number; conflicts: number; missing: number }>> {
    const rows = await this.prisma.companyCatalogProposal.groupBy({
      by: ['companyCode', 'catalogKey', 'reason'],
      where: { status: 'PENDING' },
      _count: { _all: true },
    });
    const map = new Map<string, { companyCode: string; catalogKey: string; catalogLabel: string; pending: number; conflicts: number; missing: number }>();
    for (const r of rows) {
      const k = `${r.companyCode}|${r.catalogKey}`;
      const cur = map.get(k) ?? {
        companyCode: r.companyCode,
        catalogKey: r.catalogKey,
        catalogLabel: CORPORATE_CATALOGS[r.catalogKey as CorporateCatalogKey]?.label ?? r.catalogKey,
        pending: 0, conflicts: 0, missing: 0,
      };
      cur.pending += r._count._all;
      if (r.reason === 'CONFLICTO') cur.conflicts += r._count._all;
      else cur.missing += r._count._all;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => a.companyCode.localeCompare(b.companyCode) || a.catalogKey.localeCompare(b.catalogKey));
  }

  private toView(r: any): ProposalView {
    return {
      id: r.id,
      catalogKey: r.catalogKey,
      catalogLabel: CORPORATE_CATALOGS[r.catalogKey as CorporateCatalogKey]?.label ?? r.catalogKey,
      companyCode: r.companyCode,
      masterCode: r.masterCode,
      masterDescription: r.masterDescription,
      localCode: r.localCode,
      reason: r.reason as ProposalReason,
      detail: r.detail,
      status: r.status as ProposalStatus,
      createdAt: r.createdAt ? r.createdAt.toISOString() : new Date().toISOString(),
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
      decidedBy: r.decidedBy,
    };
  }

  /**
   * Confirma la propuesta: crea el elemento en la empresa destino y registra el
   * vínculo. Exige flag de escritura + permiso PROFIT.WRITE (aplicado en el
   * controller) y transacción global.
   */
  async confirm(id: string, localCode: string | undefined, actorId: string): Promise<ProposalView> {
    const p = await this.prisma.companyCatalogProposal.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Propuesta no encontrada.');
    if (p.status !== 'PENDING') throw new BadRequestException(`La propuesta ya fue ${p.status.toLowerCase()}.`);

    const key = p.catalogKey as CorporateCatalogKey;
    const desc = CORPORATE_CATALOGS[key];
    if (!desc) throw new BadRequestException(`Catálogo desconocido: ${p.catalogKey}.`);

    const code = up(localCode || p.localCode);
    if (!code) throw new BadRequestException('Indique el código local a crear.');
    if (code.length > MAX_CODE_LEN) throw new BadRequestException(`El código no puede superar ${MAX_CODE_LEN} caracteres.`);

    // Padre traducido con los vínculos ya confirmados (sub_lin → lin_art).
    // Se resuelve ANTES del chequeo de ocupación: en catálogos jerárquicos la
    // identidad real es el PAR (co_subl, co_lin) — es la PK de Profit.
    let parent: string | undefined;
    if (desc.parentCatalog) {
      const masterParent = await this.prisma.masterCatalogEntry.findUnique({
        where: { catalogKey_code: { catalogKey: key, code: p.masterCode } },
      });
      const parentMaster = masterParent?.parentCode;
      if (parentMaster) {
        const link = await this.prisma.companyCatalogCode.findFirst({
          where: { catalogKey: desc.parentCatalog, companyCode: p.companyCode, masterCode: up(parentMaster), active: true },
        });
        parent = link ? link.localCode : up(parentMaster);
      }
    }

    // Verificación fresca: el código debe seguir libre en destino, con la MISMA
    // identidad que usó analyze(). En catálogos jerárquicos se compara el par
    // (código + padre), porque Profit admite el mismo código de sublínea bajo
    // líneas distintas; si no, un código libre se reportaría como ocupado.
    const rows = await this.readCatalog(p.companyCode, key);
    const clash = rows.find((r) => (desc.parentColumn
      ? up(r.code) === code && up(r.parent ?? '') === up(parent ?? '')
      : up(r.code) === code));
    if (clash) {
      throw new ConflictException(
        desc.parentColumn
          ? `El par (${parent ?? '—'}, ${code}) ya existe en ${p.companyCode} con la descripción "${clash.description}".`
          : `El código ${code} ya existe en ${p.companyCode} con la descripción "${clash.description}".`,
      );
    }

    await this.createElement(p.companyCode, key, code, p.masterDescription, parent);
    await this.saveLink(key, p.companyCode, p.masterCode, code, p.detail, actorId);

    const decided = await this.prisma.companyCatalogProposal.update({
      where: { id },
      data: { status: 'CONFIRMED', localCode: code, decidedAt: new Date(), decidedBy: actorId },
    });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      entityType: 'CompanyCatalogProposal',
      entityId: id,
      action: 'MULTIEMPRESA_CATALOG_CONFIRMED',
      afterData: JSON.stringify({ company: p.companyCode, catalogKey: key, masterCode: p.masterCode, localCode: code, reason: p.reason }),
    }).catch((e: any) => this.logger.error(`Audit failed: ${e?.message}`));
    return this.toView(decided);
  }

  /** Confirma varias propuestas de una vez (acepta las que no quieras tocar). */
  async confirmBulk(ids: string[], overrides: Record<string, string>, actorId: string): Promise<{ confirmed: number; errors: string[] }> {
    const errors: string[] = [];
    let confirmed = 0;
    for (const id of ids ?? []) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.confirm(id, overrides?.[id], actorId);
        confirmed += 1;
      } catch (e: any) {
        const detail = String(e?.message ?? e).slice(0, 140);
        errors.push(`${id}: ${detail}`);
        // Sin esto el fallo quedaba invisible: se devolvía a la UI pero no se
        // registraba en el log del servidor.
        this.logger.warn(`Confirmación rechazada ${id}: ${detail}`);
      }
    }
    return { confirmed, errors };
  }

  async confirmAll(company: string, catalog: string | undefined, actorId: string): Promise<{ confirmed: number; errors: string[] }> {
    const pending = await this.prisma.companyCatalogProposal.findMany({
      where: { companyCode: up(company), status: 'PENDING', ...(catalog ? { catalogKey: catalog } : {}) },
      orderBy: [{ catalogKey: 'asc' }, { masterCode: 'asc' }],
      select: { id: true },
    });
    return this.confirmBulk(pending.map((p) => p.id), {}, actorId);
  }

  /**
   * Descarta (REJECTED) las propuestas PENDING de los catálogos indicados.
   * Por defecto, los que quedan fuera del alcance por defecto: proveedores y
   * procedencias. NO toca Profit: solo ordena el backlog local. Devuelve
   * cuántas se descartaron para que la UI descuente el contador.
   */
  async discardCatalogs(
    catalogs: string[] | undefined,
    actorId: string,
  ): Promise<{ rejected: number; catalogs: string[] }> {
    const keys = (catalogs?.length ? catalogs : PROVIDER_CATALOGS)
      .map((k) => String(k ?? '').trim())
      .filter(Boolean);
    if (!keys.length) throw new BadRequestException('Indique al menos un catálogo a descartar.');
    const res = await this.prisma.companyCatalogProposal.updateMany({
      where: { status: 'PENDING', catalogKey: { in: keys } },
      data: { status: 'REJECTED', decidedAt: new Date(), decidedBy: actorId },
    });
    const rejected = res?.count ?? 0;
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      entityType: 'CompanyCatalogProposal',
      entityId: 'DESCARTE',
      action: 'MULTIEMPRESA_CATALOG_DISCARDED',
      afterData: JSON.stringify({ catalogs: keys, rejected, note: 'Propuestas fuera del alcance por defecto; nada se escribió en Profit.' }),
    }).catch((e: any) => this.logger.error(`Audit failed: ${e?.message}`));
    return { rejected, catalogs: keys };
  }

  async reject(id: string, actorId: string, note?: string): Promise<ProposalView> {
    const p = await this.prisma.companyCatalogProposal.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Propuesta no encontrada.');
    if (p.status !== 'PENDING') throw new BadRequestException(`La propuesta ya fue ${p.status.toLowerCase()}.`);
    const decided = await this.prisma.companyCatalogProposal.update({
      where: { id },
      data: { status: 'REJECTED', decidedAt: new Date(), decidedBy: actorId, detail: note ? `${p.detail} — ${note}` : p.detail },
    });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      entityType: 'CompanyCatalogProposal',
      entityId: id,
      action: 'MULTIEMPRESA_CATALOG_REJECTED',
      afterData: JSON.stringify({ company: p.companyCode, catalogKey: p.catalogKey, masterCode: p.masterCode, localCode: p.localCode, note: note ?? null }),
    }).catch((e: any) => this.logger.error(`Audit failed: ${e?.message}`));
    return this.toView(decided);
  }

  // -------------------------------- 4. resolución de códigos del artículo

  /**
   * Traduce el payload del artículo a los códigos locales de la empresa usando
   * los vínculos CONFIRMADOS. Sin vínculo usa el código del maestro.
   */
  async resolveArticleInput(company: string, input: ProfitArticleInput): Promise<ProfitArticleInput> {
    const links = await this.prisma.companyCatalogCode.findMany({ where: { companyCode: company, active: true } });
    const map = new Map<string, string>();
    for (const l of links) map.set(`${l.catalogKey}|${up(l.masterCode)}`, l.localCode);
    const local = (key: string, code?: string | null): string | undefined => {
      const c = String(code ?? '').trim();
      if (!c) return undefined;
      return map.get(`${key}|${up(c)}`) ?? c;
    };
    return {
      ...input,
      groupCode: local('lin_art', input.groupCode) ?? input.groupCode,
      subgroupCode: local('sub_lin', input.subgroupCode) ?? input.subgroupCode,
      categoryCode: local('cat_art', input.categoryCode),
      colorCode: local('colores', input.colorCode),
      unitCode: local('unidades', input.unitCode) ?? input.unitCode,
      taxType: local('tabulado', input.taxType) ?? input.taxType,
      originCode: local('proceden', input.originCode),
      providerCode: local('prov', input.providerCode),
    };
  }
}
