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

/** Ancho máximo de los códigos de catálogo en Profit (char(6) en AD_TRANS). */
const MAX_CODE_LEN = 6;

export interface CatalogDiffLine {
  catalogKey: CorporateCatalogKey;
  catalogLabel: string;
  masterCode: string;
  masterDescription: string;
  /** Estado en la empresa destino. */
  state: 'IGUAL' | 'FALTA' | 'CONFLICTO' | 'RESUELTO';
  /** Código que existe hoy en destino con otro significado. */
  localExistingCode: string | null;
  localExistingDescription: string | null;
  /** Código propuesto (para FALTA = el del maestro; para CONFLICTO = COM1…). */
  proposedCode: string | null;
  detail: string;
}

export interface CompanyCatalogReport {
  company: string;
  name: string;
  isStandard: boolean;
  counts: { iguales: number; faltantes: number; conflictos: number; resueltos: number };
  lines: CatalogDiffLine[];
}

export interface CatalogAnalysisResult {
  standard: string;
  masterTotal: number;
  companies: CompanyCatalogReport[];
  pendingProposals: number;
  analyzedAt: string;
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

/**
 * FASE 27 — MANEJO MULTIEMPRESA.
 *
 * Integra los catálogos del maestro (AD_TRANS) hacia el resto de empresas de
 * `TEmpresas` siguiendo reglas estrictas:
 *
 *  1. Si ya existe un vínculo confirmado → el elemento está resuelto.
 *  2. Si el código del maestro existe libre en destino → se puede replicar tal cual.
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

  private async readCatalogsOf(company: string): Promise<Record<CorporateCatalogKey, CatalogRow[]>> {
    const out = {} as Record<CorporateCatalogKey, CatalogRow[]>;
    for (const key of CORPORATE_CATALOG_ORDER) {
      // eslint-disable-next-line no-await-in-loop
      out[key] = await this.readCatalog(company, key);
    }
    return out;
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
          create: {
            catalogKey: key,
            code: r.code,
            description: r.description,
            parentCode: r.parent ? r.parent : null,
          },
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

  // -------------------------------------------- 2. analizar y proponer

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
   * Compara el maestro contra cada empresa, registra las propuestas PENDING y
   * devuelve el reporte. Solo lectura en Profit + escritura local.
   */
  async analyze(actorId?: string): Promise<CatalogAnalysisResult> {
    const masterTotal = await this.masterCount();
    if (masterTotal === 0) {
      throw new BadRequestException('Sincronice primero el catálogo maestro (AD_TRANS).');
    }
    const masterRows = await this.prisma.masterCatalogEntry.findMany({ where: { active: true } });
    const masterByKey = new Map<CorporateCatalogKey, Map<string, { description: string; parent: string | null }>>();
    for (const key of CORPORATE_CATALOG_ORDER) masterByKey.set(key, new Map());
    for (const m of masterRows) {
      if (!masterByKey.has(m.catalogKey as CorporateCatalogKey)) continue;
      masterByKey.get(m.catalogKey as CorporateCatalogKey)!.set(up(m.code), {
        description: m.description,
        parent: m.parentCode ? up(m.parentCode) : null,
      });
    }

    const list = await this.companies.listCompanies();
    const mapped = await this.prisma.companyCatalogCode.findMany({ where: { active: true } });
    const mappedKey = (catalogKey: string, company: string, master: string) =>
      mapped.some((r) => r.catalogKey === catalogKey && r.companyCode === company && up(r.masterCode) === master);

    const reports: CompanyCatalogReport[] = [];
    let created = 0;

    for (const c of list) {
      if (c.code === STANDARD_COMPANY) {
        reports.push({
          company: c.code, name: c.name, isStandard: true,
          counts: { iguales: 0, faltantes: 0, conflictos: 0, resueltos: 0 }, lines: [],
        });
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const dest = await this.readCatalogsOf(c.code);
      const lines: CatalogDiffLine[] = [];
      const counts = { iguales: 0, faltantes: 0, conflictos: 0, resueltos: 0 };

      for (const key of CORPORATE_CATALOG_ORDER) {
        const master = masterByKey.get(key)!;
        const desc = CORPORATE_CATALOGS[key];
        // Índice del destino: código normalizado (y par código|padre si es jerárquico).
        const index = new Map<string, CatalogRow>();
        const used = new Set<string>();
        for (const r of dest[key]) {
          const k = desc.parentColumn ? `${up(r.parent ?? '')}|${up(r.code)}` : up(r.code);
          index.set(k, r);
          used.add(up(r.code));
        }
        // El padre se traduce con el vínculo ya confirmado.
        const parentLocal = (parentMaster: string | null): string | null => {
          if (!parentMaster || !desc.parentCatalog) return null;
          const hit = mapped.find(
            (r) => r.catalogKey === desc.parentCatalog && r.companyCode === c.code && up(r.masterCode) === parentMaster,
          );
          return hit ? hit.localCode : parentMaster;
        };

        for (const [mcode, mval] of master) {
          const pLocal = parentLocal(mval.parent);
          const k = desc.parentColumn ? `${pLocal ?? ''}|${mcode}` : mcode;
          const found = index.get(k);
          const base: Omit<CatalogDiffLine, 'state' | 'localExistingCode' | 'localExistingDescription' | 'proposedCode' | 'detail'> = {
            catalogKey: key, catalogLabel: desc.label, masterCode: mcode, masterDescription: mval.description,
          };
          if (mappedKey(key, c.code, mcode)) {
            counts.resueltos += 1;
            lines.push({ ...base, state: 'RESUELTO', localExistingCode: null, localExistingDescription: null, proposedCode: null, detail: 'Vínculo confirmado: ya existe con su código local.' });
            continue;
          }
          if (!found) {
            counts.faltantes += 1;
            lines.push({ ...base, state: 'FALTA', localExistingCode: null, localExistingDescription: null, proposedCode: mcode, detail: 'No existe en esta empresa. Se creará con el código del maestro.' });
            // eslint-disable-next-line no-await-in-loop
            created += await this.ensureProposal(key, c.code, mcode, mval.description, mcode, 'FALTA', 'No existe en esta empresa; se creará con el código del maestro.');
            continue;
          }
          if (normDesc(found.description) === normDesc(mval.description)) {
            counts.iguales += 1;
            lines.push({ ...base, state: 'IGUAL', localExistingCode: found.code, localExistingDescription: found.description, proposedCode: null, detail: 'Ya coincide con el maestro.' });
            continue;
          }
          // CONFLICTO: mismo código, otro significado. No se toca lo existente.
          counts.conflictos += 1;
          const proposal = this.nextFreeCode(mcode, used);
          used.add(up(proposal));
          lines.push({
            ...base, state: 'CONFLICTO',
            localExistingCode: found.code, localExistingDescription: found.description,
            proposedCode: proposal,
            detail: `El código ${found.code} ya existe con otra descripción ("${found.description}"). Se propone crear ${proposal} sin tocar la fila existente.`,
          });
          // eslint-disable-next-line no-await-in-loop
          created += await this.ensureProposal(key, c.code, mcode, mval.description, proposal, 'CONFLICTO', `El código ${found.code} ya existe con otra descripción ("${found.description}").`);
        }
      }
      reports.push({ company: c.code, name: c.name, isStandard: false, counts, lines });
    }

    const pending = await this.prisma.companyCatalogProposal.count({ where: { status: 'PENDING' } });
    const result: CatalogAnalysisResult = {
      standard: STANDARD_COMPANY,
      masterTotal,
      companies: reports,
      pendingProposals: pending,
      analyzedAt: new Date().toISOString(),
    };
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      entityType: 'CatalogAnalysis',
      entityId: 'ANALISIS',
      action: 'MULTIEMPRESA_CATALOG_ANALYZED',
      afterData: JSON.stringify({ companies: reports.map((r) => ({ company: r.company, ...r.counts })), pending, created }),
    }).catch((e: any) => this.logger.error(`Audit failed: ${e?.message}`));
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

  async proposals(company?: string): Promise<ProposalView[]> {
    const rows = await this.prisma.companyCatalogProposal.findMany({
      where: company ? { companyCode: company } : undefined,
      orderBy: [{ status: 'asc' }, { companyCode: 'asc' }, { catalogKey: 'asc' }, { masterCode: 'asc' }],
    });
    return rows.map((r) => ({
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
      createdAt: r.createdAt.toISOString(),
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
      decidedBy: r.decidedBy,
    }));
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

    // Verificación fresca: el código debe seguir libre en destino.
    const rows = await this.readCatalog(p.companyCode, key);
    const clash = rows.find((r) => up(r.code) === code);
    if (clash) {
      throw new ConflictException(`El código ${code} ya existe en ${p.companyCode} con la descripción "${clash.description}".`);
    }

    // Padre traducido con los vínculos ya confirmados (sub_lin → lin_art).
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
        parent = link ? link.localCode : parentMaster;
      }
    }

    const mssql = await this.types();
    const integrationUser = this.integrationUser();
    const { sql, params } = catalogInsertForCompany(desc, p.companyCode, {
      ...(desc.acceptsIntegrationUser ? { integrationUser } : {}),
    });
    // catalogInsertForCompany devuelve nombres sueltos (c0, c1, c2, cu): se
    // convierten en parámetros tipados con el valor real de cada columna.
    const size: Record<string, number> = { c0: 30, c1: 120, c2: 6, cu: 6 };
    const values: Record<string, string> = {
      c0: code,
      c1: p.masterDescription,
      c2: parent ?? '',
      cu: integrationUser,
    };
    const boundParams: ProfitParam[] = params.map((name) => ({
      name,
      kind: 'char',
      size: size[name] ?? 30,
      value: values[name] ?? '',
    }));
    const bound = bindProfitParams(mssql, boundParams);

    await this.writeAdapter.runInGlobalTransaction(async (tx) => {
      await tx(sql, bound);
    });

    await this.prisma.companyCatalogCode.upsert({
      where: { catalogKey_companyCode_masterCode: { catalogKey: key, companyCode: p.companyCode, masterCode: p.masterCode } },
      create: {
        catalogKey: key,
        companyCode: p.companyCode,
        masterCode: p.masterCode,
        localCode: code,
        origin: code === p.masterCode ? 'MASTER' : 'LOCAL_NEW',
        note: p.detail,
        createdBy: actorId,
      },
      update: { localCode: code, active: true, createdBy: actorId, note: p.detail },
    });
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
    return {
      id: decided.id,
      catalogKey: decided.catalogKey,
      catalogLabel: desc.label,
      companyCode: decided.companyCode,
      masterCode: decided.masterCode,
      masterDescription: decided.masterDescription,
      localCode: decided.localCode,
      reason: decided.reason as ProposalReason,
      detail: decided.detail,
      status: decided.status as ProposalStatus,
      createdAt: decided.createdAt.toISOString(),
      decidedAt: decided.decidedAt ? decided.decidedAt.toISOString() : null,
      decidedBy: decided.decidedBy,
    };
  }

  async confirmAll(company: string, actorId: string): Promise<{ confirmed: number; errors: string[] }> {
    const pending = await this.prisma.companyCatalogProposal.findMany({
      where: { companyCode: company, status: 'PENDING' },
      orderBy: [{ catalogKey: 'asc' }, { masterCode: 'asc' }],
    });
    const errors: string[] = [];
    let confirmed = 0;
    for (const p of pending) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.confirm(p.id, undefined, actorId);
        confirmed += 1;
      } catch (e: any) {
        errors.push(`${p.catalogKey}/${p.masterCode}: ${String(e?.message ?? e).slice(0, 140)}`);
      }
    }
    return { confirmed, errors };
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
    return {
      id: decided.id,
      catalogKey: decided.catalogKey,
      catalogLabel: CORPORATE_CATALOGS[decided.catalogKey as CorporateCatalogKey]?.label ?? decided.catalogKey,
      companyCode: decided.companyCode,
      masterCode: decided.masterCode,
      masterDescription: decided.masterDescription,
      localCode: decided.localCode,
      reason: decided.reason as ProposalReason,
      detail: decided.detail,
      status: decided.status as ProposalStatus,
      createdAt: decided.createdAt.toISOString(),
      decidedAt: decided.decidedAt ? decided.decidedAt.toISOString() : null,
      decidedBy: decided.decidedBy,
    };
  }

  // -------------------------------- 4. resolución de códigos del artículo

  /**
   * Traduce el payload del artículo a los códigos locales de la empresa usando
   * los vínculos CONFIRMADOS. Sin vínculo usa el código del maestro.
   * Nunca inventa: lo no confirmado queda igual (y el preflight lo bloquea).
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

  /** Empresas con catálogos pendientes de decisión (para el panel). */
  async pendingSummary(): Promise<Array<{ companyCode: string; pending: number; conflicts: number; missing: number }>> {
    const rows = await this.prisma.companyCatalogProposal.groupBy({
      by: ['companyCode', 'reason'],
      where: { status: 'PENDING' },
      _count: { _all: true },
    });
    const out = new Map<string, { companyCode: string; pending: number; conflicts: number; missing: number }>();
    for (const r of rows) {
      const cur = out.get(r.companyCode) ?? { companyCode: r.companyCode, pending: 0, conflicts: 0, missing: 0 };
      cur.pending += r._count._all;
      if (r.reason === 'CONFLICTO') cur.conflicts += r._count._all;
      else cur.missing += r._count._all;
      out.set(r.companyCode, cur);
    }
    return [...out.values()].sort((a, b) => a.companyCode.localeCompare(b.companyCode));
  }
}
