import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ProfitAdapterService } from './profit-adapter.service';
import {
  CORPORATE_CATALOGS,
  catalogSelectForCompany,
  type CorporateCatalogKey,
  type CatalogRow,
} from './corporate-catalogs';
import { STANDARD_COMPANY, normalizeCompany } from './corporate-company';
import {
  buildEquivalenceMap,
  equivalenceKey,
  resolveCodeWithMap,
  resolvePayloadWithMap,
  validateEquivalence,
  type EquivalenceLookup,
  type EquivalenceRecord,
} from './corporate-equivalence';
import type { ProfitArticlePayload } from './profit-article.payload';

export interface EquivalenceView extends EquivalenceRecord {
  catalogLabel: string;
  standardDescription: string | null;
}

export interface EquivalenceSuggestion {
  catalogKey: CorporateCatalogKey;
  catalogLabel: string;
  standardCode: string;
  standardDescription: string;
  localCode: string;
  localDescription: string;
  reason: string;
}

const CACHE_TTL_MS = 30_000;

/**
 * FASE 26 — Administración y resolución de equivalencias de catálogos.
 *
 * Es la pieza que hace posible "01 HERRAMIENTAS (AD_TRANS) = 01A HERRAMIENTAS
 * (AD_DISAY)": el vínculo se registra a mano, se audita y el motor lo respeta
 * antes de decidir INSERT. Sin equivalencia el comportamiento es EXACTAMENTE
 * el anterior (objeto identidad NO_EQUIVALENCES).
 *
 * Solo lectura de Profit: las sugerencias comparan catálogos; la escritura es
 * únicamente en la base local.
 */
@Injectable()
export class CorporateEquivalenceService implements EquivalenceLookup {
  private readonly logger = new Logger(CorporateEquivalenceService.name);
  private cache: { at: number; byCompany: Map<string, Map<string, EquivalenceRecord>> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly readAdapter: ProfitAdapterService,
  ) {}

  // ------------------------------------------------------------ resolución

  private async mapFor(company: string): Promise<Map<string, EquivalenceRecord>> {
    const code = normalizeCompany(company);
    if (!code || code === STANDARD_COMPANY) return new Map();
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      const hit = this.cache.byCompany.get(code);
      if (hit) return hit;
    }
    let rows: Array<{
      id: string; catalogKey: string; companyCode: string; standardCode: string;
      localCode: string; active: boolean; note: string | null; createdBy: string | null;
      createdAt: Date; updatedAt: Date;
    }> = [];
    try {
      rows = await this.prisma.catalogCodeEquivalence.findMany({ where: { companyCode: code, active: true } });
    } catch (e: any) {
      // Sin tabla/lectura disponible: sin equivalencias (comportamiento previo).
      this.logger.warn(`Equivalencias no legibles para ${code}: ${e?.message}`);
      rows = [];
    }
    const map = buildEquivalenceMap(rows as unknown as EquivalenceRecord[]);
    const byCompany = this.cache?.byCompany ?? new Map<string, Map<string, EquivalenceRecord>>();
    byCompany.set(code, map);
    this.cache = { at: Date.now(), byCompany };
    return map;
  }

  async codesForCatalog(company: string, catalogKey: CorporateCatalogKey): Promise<Map<string, string>> {
    const code = normalizeCompany(company);
    const full = await this.mapFor(code);
    const out = new Map<string, string>();
    for (const rec of full.values()) {
      if (rec.catalogKey !== catalogKey) continue;
      out.set(rec.standardCode, rec.localCode);
    }
    return out;
  }

  async resolveCode(company: string, catalogKey: CorporateCatalogKey, standardCode: string): Promise<string> {
    const map = await this.mapFor(normalizeCompany(company));
    return resolveCodeWithMap(map, catalogKey, normalizeCompany(company), standardCode);
  }

  async resolvePayload(company: string, payload: ProfitArticlePayload): Promise<ProfitArticlePayload> {
    const code = normalizeCompany(company);
    const map = await this.mapFor(code);
    return resolvePayloadWithMap(payload, map, code);
  }

  clearCache(): void {
    this.cache = null;
  }

  // ----------------------------------------------------------- administración

  async list(companyCode?: string): Promise<EquivalenceView[]> {
    const code = companyCode ? normalizeCompany(companyCode) : undefined;
    const rows = await this.prisma.catalogCodeEquivalence.findMany({
      where: code ? { companyCode: code } : undefined,
      orderBy: [{ companyCode: 'asc' }, { catalogKey: 'asc' }, { standardCode: 'asc' }],
    });
    return (rows as unknown as EquivalenceRecord[]).map((r) => ({
      ...r,
      catalogLabel: CORPORATE_CATALOGS[r.catalogKey]?.label ?? r.catalogKey,
      standardDescription: null,
    }));
  }

  async upsert(
    dto: { catalogKey?: unknown; companyCode?: unknown; standardCode?: unknown; localCode?: unknown; note?: unknown },
    actorId: string,
  ): Promise<EquivalenceView> {
    const data = validateEquivalence(dto);
    const where = {
      catalogKey_companyCode_standardCode: {
        catalogKey: data.catalogKey,
        companyCode: data.companyCode,
        standardCode: data.standardCode,
      },
    };
    const existing = await this.prisma.catalogCodeEquivalence.findUnique({ where });
    const row = await this.prisma.catalogCodeEquivalence.upsert({
      where,
      create: { ...data, active: true, createdBy: actorId },
      update: { localCode: data.localCode, note: data.note, active: true },
    });
    this.clearCache();
    await this.audit(actorId, existing ? 'CORPORATE_EQUIVALENCE_UPDATED' : 'CORPORATE_EQUIVALENCE_CREATED', row.id, {
      before: existing ?? null,
      after: row,
    });
    return { ...(row as unknown as EquivalenceRecord), catalogLabel: CORPORATE_CATALOGS[data.catalogKey].label, standardDescription: null };
  }

  async deactivate(id: string, actorId: string): Promise<{ id: string; active: boolean }> {
    const existing = await this.prisma.catalogCodeEquivalence.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Equivalencia ${id} no encontrada.`);
    const row = await this.prisma.catalogCodeEquivalence.update({ where: { id }, data: { active: false } });
    this.clearCache();
    await this.audit(actorId, 'CORPORATE_EQUIVALENCE_DEACTIVATED', id, { before: existing, after: row });
    return { id: row.id, active: row.active };
  }

  /**
   * Sugerencias de solo lectura: filas del estándar ausentes en la empresa
   * cuya descripción coincide exactamente con una fila local de otro código.
   * NUNCA se aplican solas: alguien debe confirmar (regla del usuario).
   */
  async suggest(company: string): Promise<EquivalenceSuggestion[]> {
    const code = normalizeCompany(company);
    if (!code) throw new BadRequestException('Empresa requerida.');
    if (code === STANDARD_COMPANY) throw new BadRequestException('AD_TRANS es la referencia canónica.');
    const existing = await this.mapFor(code);
    const out: EquivalenceSuggestion[] = [];
    for (const key of Object.keys(CORPORATE_CATALOGS) as CorporateCatalogKey[]) {
      const desc = CORPORATE_CATALOGS[key];
      // eslint-disable-next-line no-await-in-loop
      const [std, dest] = await Promise.all([
        this.readCatalog(STANDARD_COMPANY, key),
        this.readCatalog(code, key),
      ]);
      const destByCode = new Map(dest.map((r) => [r.code.toUpperCase(), r]));
      const destByDesc = new Map<string, CatalogRow>();
      for (const r of dest) {
        const d = r.description.trim().toUpperCase();
        if (d && !destByDesc.has(d)) destByDesc.set(d, r);
      }
      for (const s of std) {
        const stdCode = s.code.trim();
        if (!stdCode || destByCode.has(stdCode.toUpperCase())) continue;
        const localKey = equivalenceKey(key, code, stdCode);
        if (existing.has(localKey)) continue;
        const local = destByDesc.get(s.description.trim().toUpperCase());
        if (!local || local.code.trim().toUpperCase() === stdCode.toUpperCase()) continue;
        out.push({
          catalogKey: key,
          catalogLabel: desc.label,
          standardCode: stdCode,
          standardDescription: s.description.trim(),
          localCode: local.code.trim(),
          localDescription: local.description.trim(),
          reason: `Misma descripción en ${STANDARD_COMPANY} y ${code} con códigos distintos.`,
        });
      }
    }
    return out;
  }

  private async readCatalog(db: string, key: CorporateCatalogKey): Promise<CatalogRow[]> {
    try {
      const rows = await this.readAdapter.rawQuery<Record<string, string>>(catalogSelectForCompany(CORPORATE_CATALOGS[key], db));
      return (rows ?? []).map((r) => ({
        code: String(r['code'] ?? '').trim(),
        description: String(r['description'] ?? '').trim(),
        parent: r['parent'] !== undefined ? String(r['parent'] ?? '').trim() : undefined,
      }));
    } catch {
      return [];
    }
  }

  private async audit(actorId: string, action: string, entityId: string, after: Record<string, unknown>): Promise<void> {
    try {
      await this.auditoria.logEvent({
        correlationId: randomUUID(),
        requestId: undefined,
        actorId,
        entityType: 'CatalogCodeEquivalence',
        entityId,
        action,
        afterData: JSON.stringify(after).slice(0, 8000),
      });
    } catch (e: any) {
      this.logger.error(`Audit failed (${action}): ${e?.message}`);
    }
  }
}
