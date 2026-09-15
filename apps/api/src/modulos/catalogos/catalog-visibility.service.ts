import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { ProfitAdapterService } from '../profit/profit-adapter.service';

/**
 * Configuración local de visibilidad de catálogos Profit (FASE CAT).
 *
 * Profit es la fuente oficial (solo lectura, nunca se modifica). Esta capa
 * controla qué valores son visibles/seleccionables en Data-Maestra:
 *   catálogo efectivo = Profit × configuración.
 * companyId '' = global; si existe configuración por empresa, prevalece.
 *
 * Tipos: GROUP | SUBGROUP | CATEGORY | BRAND | UNIT | TAX | ARTICLE_TYPE.
 * Modos: ALL (todo lo activo de Profit) | SELECTED (solo marcados visibles).
 */

export const CATALOG_TYPES = [
  'GROUP',
  'SUBGROUP',
  'CATEGORY',
  'BRAND',
  'UNIT',
  'TAX',
  'ARTICLE_TYPE',
] as const;

export type CatalogType = (typeof CATALOG_TYPES)[number];
export type VisibilityMode = 'ALL' | 'SELECTED';

export interface EffectiveItem {
  code: string;
  description: string;
  parentCode: string;
  visible: boolean;
  availableInProfit: boolean;
  /** En modo SELECTED: existe en Profit pero sin configuración visible. */
  isNew: boolean;
  synchronizedAt: string | null;
  /** Metadatos Profit preservados (p. ej. functional/usageCount de tipos). */
  extra?: Record<string, unknown>;
}

export interface EffectiveCatalog {
  items: EffectiveItem[];
  total: number;
  mode: VisibilityMode;
  source: 'PROFIT_LIVE' | 'PROFIT_SNAPSHOT';
  synchronizedAt: string | null;
}

interface ProfitRow {
  code: string;
  description: string;
  parentCode?: string;
  extra?: Record<string, unknown>;
}

const CACHE_TTL_MS = 60_000;

@Injectable()
export class CatalogVisibilityService {
  private readonly cache = new Map<string, { at: number; data: EffectiveCatalog }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly profit?: ProfitAdapterService,
  ) {}

  // =====================================================================
  // Configuración (ADMIN.MANAGE en el controlador)
  // =====================================================================

  private scope(companyId?: string): string {
    return (companyId ?? '').trim();
  }

  private async assertCompany(scope: string): Promise<void> {
    if (!scope) return;
    const company = await this.prisma.company.findUnique({ where: { id: scope } });
    if (!company) throw new BadRequestException(`Empresa inexistente: ${scope}`);
  }

  private assertType(type: string): asserts type is CatalogType {
    if (!(CATALOG_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException(`Catálogo desconocido: ${type}`);
    }
  }

  async getMode(catalogType: string, companyId?: string): Promise<VisibilityMode> {
    this.assertType(catalogType);
    const scope = this.scope(companyId);
    const specific = scope
      ? await this.prisma.catalogVisibilityMode.findUnique({
          where: { catalogType_companyId: { catalogType, companyId: scope } },
        })
      : null;
    if (specific) return specific.mode as VisibilityMode;
    const global = await this.prisma.catalogVisibilityMode.findUnique({
      where: { catalogType_companyId: { catalogType, companyId: '' } },
    });
    return ((global?.mode as VisibilityMode) ?? 'ALL');
  }

  async setMode(
    catalogType: string,
    mode: string,
    opts: { companyId?: string; actorId: string; actorCompanyId?: string },
  ): Promise<{ catalogType: string; companyId: string; mode: VisibilityMode }> {
    this.assertType(catalogType);
    if (mode !== 'ALL' && mode !== 'SELECTED') {
      throw new BadRequestException(`Modo inválido: ${mode} (ALL | SELECTED)`);
    }
    const scope = this.scope(opts.companyId);
    await this.assertCompany(scope);
    const before = await this.getMode(catalogType, opts.companyId);
    await this.prisma.catalogVisibilityMode.upsert({
      where: { catalogType_companyId: { catalogType, companyId: scope } },
      update: { mode, actorId: opts.actorId },
      create: { catalogType, companyId: scope, mode, actorId: opts.actorId },
    });
    this.invalidate(catalogType);
    await this.audit(opts.actorId, opts.actorCompanyId, 'CATALOG_VISIBILITY_MODE_CHANGED', catalogType, {
      catalogType,
      companyId: scope || null,
      before,
      after: mode,
    });
    return { catalogType, companyId: scope, mode: mode as VisibilityMode };
  }

  async setItemsVisible(
    catalogType: string,
    codes: Array<{ code: string; parentCode?: string }>,
    visible: boolean,
    opts: { companyId?: string; actorId: string; actorCompanyId?: string },
  ): Promise<{ updated: number }> {
    this.assertType(catalogType);
    const scope = this.scope(opts.companyId);
    await this.assertCompany(scope);
    const normalized = [...new Map(
      codes
        .map((c) => ({ code: (c.code ?? '').trim(), parentCode: (c.parentCode ?? '').trim() }))
        .filter((c) => c.code)
        .map((c) => [`${c.parentCode}|${c.code}`, c] as const),
    ).values()];
    if (normalized.length === 0) throw new BadRequestException('Sin códigos para actualizar');
    if (normalized.length > 500) throw new BadRequestException('Máximo 500 códigos por operación');
    for (const c of normalized) {
      await this.prisma.catalogVisibilityItem.upsert({
        where: {
          catalogType_profitCode_parentCode_companyId: {
            catalogType, profitCode: c.code, parentCode: c.parentCode, companyId: scope,
          },
        },
        update: { visible, decided: true },
        create: {
          catalogType, profitCode: c.code, parentCode: c.parentCode,
          companyId: scope, visible, decided: true,
        },
      });
    }
    this.invalidate(catalogType);
    await this.audit(
      opts.actorId, opts.actorCompanyId,
      visible ? 'CATALOG_ITEM_ENABLED' : 'CATALOG_ITEM_DISABLED',
      catalogType,
      { catalogType, companyId: scope || null, visible, codes: normalized },
    );
    return { updated: normalized.length };
  }

  // =====================================================================
  // Sincronización con Profit (solo lectura Profit + upsert local)
  // =====================================================================

  private async fetchProfitRows(catalogType: CatalogType): Promise<ProfitRow[]> {
    if (!this.profit) throw new ServiceUnavailableException('Adapter Profit no disponible');
    switch (catalogType) {
      case 'GROUP': {
        const rows = await this.profit.getGroups();
        return rows.map((g) => ({ code: (g.co_lin ?? '').trim(), description: (g.lin_des ?? '').trim() }));
      }
      case 'SUBGROUP': {
        const rows = await this.profit.getSubgroups();
        return rows.map((s) => ({
          code: (s.co_subl ?? '').trim(), parentCode: (s.co_lin ?? '').trim(),
          description: (s.subl_des ?? '').trim(),
        }));
      }
      case 'CATEGORY': {
        const rows = await this.profit.getCategories();
        return rows.map((c) => ({ code: (c.co_cat ?? '').trim(), description: (c.cat_des ?? '').trim() }));
      }
      case 'BRAND': {
        const rows = await this.profit.getBrands();
        return rows.map((b) => ({ code: (b.co_col ?? '').trim(), description: (b.des_col ?? '').trim() }));
      }
      case 'UNIT': {
        const rows = await this.profit.getUnits();
        return rows.map((u) => ({
          code: ((u as { co_uni?: string }).co_uni ?? '').trim(),
          description: ((u as { des_uni?: string }).des_uni ?? '').trim(),
        }));
      }
      case 'TAX': {
        const rows = await this.profit.getTaxTypes();
        return rows.map((t) => ({ code: (t.tipo ?? '').trim(), description: (t.descripcio ?? '').trim() }));
      }
      case 'ARTICLE_TYPE': {
        const rows = await this.profit.getArticleTypes();
        return rows.map((t) => ({
          code: (t.code ?? '').trim(), description: (t.label ?? '').trim(),
          extra: { functional: t.functional, usageCount: t.usageCount },
        }));
      }
    }
  }

  async syncCatalog(
    catalogType: string,
    opts: { actorId: string; actorCompanyId?: string },
  ): Promise<{ total: number; created: number; updated: number; unavailable: number }> {
    this.assertType(catalogType);
    const rows = (await this.fetchProfitRows(catalogType)).filter((r) => r.code);
    const now = new Date();
    const seen = new Set(rows.map((r) => `${r.parentCode ?? ''}|${r.code}`));
    let created = 0;
    let updated = 0;
    for (const r of rows) {
      const parentCode = r.parentCode ?? '';
      const prev = await this.prisma.catalogVisibilityItem.findFirst({
        where: { catalogType, profitCode: r.code, parentCode },
      });
      await this.prisma.catalogVisibilityItem.upsert({
        where: {
          catalogType_profitCode_parentCode_companyId: {
            catalogType, profitCode: r.code, parentCode, companyId: '',
          },
        },
        update: { description: r.description, availableInProfit: true, synchronizedAt: now },
        create: {
          catalogType, profitCode: r.code, parentCode, companyId: '',
          description: r.description, availableInProfit: true, visible: false,
          synchronizedAt: now,
        },
      });
      if (prev) updated += 1;
      else created += 1;
      // Grupos/subgrupos: espejo en tablas locales (FKs de RequestData/MasterItem).
      if (catalogType === 'GROUP') await this.upsertLocalGroup(r.code, r.description);
      if (catalogType === 'SUBGROUP') await this.upsertLocalSubgroup(r.parentCode ?? '', r.code, r.description);
    }
    // Desaparecidos de Profit: marcar, NUNCA borrar (§27).
    const stale = await this.prisma.catalogVisibilityItem.findMany({
      where: { catalogType, availableInProfit: true },
      select: { parentCode: true, profitCode: true },
    });
    let unavailable = 0;
    for (const s of stale) {
      if (!seen.has(`${s.parentCode}|${s.profitCode}`)) {
        await this.prisma.catalogVisibilityItem.updateMany({
          where: { catalogType, profitCode: s.profitCode, parentCode: s.parentCode },
          data: { availableInProfit: false },
        });
        unavailable += 1;
      }
    }
    this.invalidate(catalogType);
    await this.audit(opts.actorId, opts.actorCompanyId, 'CATALOG_SYNCED', catalogType, {
      catalogType, total: rows.length, created, updated, unavailable,
    });
    return { total: rows.length, created, updated, unavailable };
  }

  private async upsertLocalGroup(code: string, name: string): Promise<void> {
    const existing = await this.prisma.catalogGroup.findUnique({ where: { code } });
    if (existing) {
      await this.prisma.catalogGroup.update({
        where: { code }, data: { name, active: true, sourceSystem: 'PROFIT', sourceCode: code },
      });
    } else {
      await this.prisma.catalogGroup.create({
        data: { code, name, active: true, sourceSystem: 'PROFIT', sourceCode: code },
      });
    }
  }

  private async upsertLocalSubgroup(parentCode: string, code: string, name: string): Promise<void> {
    const group = await this.prisma.catalogGroup.findUnique({ where: { code: parentCode } });
    if (!group) return;
    const existing = await this.prisma.catalogSubgroup.findFirst({
      where: { groupId: group.id, code },
    });
    if (existing) {
      await this.prisma.catalogSubgroup.update({
        where: { id: existing.id }, data: { name, active: true, sourceSystem: 'PROFIT', sourceCode: code },
      });
    } else {
      await this.prisma.catalogSubgroup.create({
        data: { groupId: group.id, code, name, active: true, sourceSystem: 'PROFIT', sourceCode: code },
      });
    }
  }

  // =====================================================================
  // Catálogo efectivo (una sola fuente para selectores y validación)
  // =====================================================================

  private cacheKey(catalogType: string, scope: string, parentCode: string): string {
    return `${catalogType}|${scope}|${parentCode}`;
  }

  private invalidate(catalogType: string): void {
    // Dependencias: un cambio en GROUP invalida también SUBGROUP (§16).
    const affected = catalogType === 'GROUP' ? ['GROUP', 'SUBGROUP'] : [catalogType];
    for (const key of [...this.cache.keys()]) {
      if (affected.some((t) => key.startsWith(`${t}|`))) this.cache.delete(key);
    }
  }

  async getEffective(
    catalogType: string,
    opts: { companyId?: string; parentCode?: string } = {},
  ): Promise<EffectiveCatalog> {
    this.assertType(catalogType);
    const scope = this.scope(opts.companyId);
    await this.assertCompany(scope);
    const parentCode = (opts.parentCode ?? '').trim();
    const key = this.cacheKey(catalogType, scope, parentCode);
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

    const mode = await this.getMode(catalogType, opts.companyId);
    const uni = await this.getRawUniverse(catalogType, scope);
    if (!uni.live && uni.base.length === 0) {
      throw new ServiceUnavailableException('No fue posible consultar el catálogo de Profit.');
    }
    const applied = this.applyVisibility(scope, mode, uni, false);
    let items = applied.items;
    if (parentCode) items = items.filter((i) => i.parentCode === parentCode);
    // Regla padre (§16-17): subgrupo solo si el grupo padre está en el
    // catálogo efectivo de grupos (misma empresa, mismo modo).
    if (catalogType === 'SUBGROUP') {
      const groups = await this.getEffective('GROUP', { companyId: opts.companyId });
      const visibleParents = new Set(groups.items.map((g) => g.code));
      items = items.filter((i) => visibleParents.has(i.parentCode));
    }
    items = items.filter((i) => i.availableInProfit && (mode === 'ALL' || i.visible));
    items.sort((a, b) => a.code.localeCompare(b.code));
    const data: EffectiveCatalog = {
      items, total: items.length, mode, source: uni.source, synchronizedAt: uni.synchronizedAt,
    };
    this.cache.set(key, { at: Date.now(), data });
    return data;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getRawUniverse(catalogType: CatalogType, scope: string): Promise<{
    base: Array<{ code: string; description: string; parentCode: string; extra?: Record<string, unknown> }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    snap: any[];
    snapByKey: Map<string, any>;
    live: boolean;
    source: EffectiveCatalog['source'];
    synchronizedAt: string | null;
  }> {
    let live: ProfitRow[] | null = null;
    let source: EffectiveCatalog['source'] = 'PROFIT_SNAPSHOT';
    try {
      live = (await this.fetchProfitRows(catalogType)).filter((r) => r.code);
      source = 'PROFIT_LIVE';
    } catch {
      live = null;
    }
    // Snapshot: específico de empresa + global.
    const snap = await this.prisma.catalogVisibilityItem.findMany({
      where: { catalogType, companyId: { in: scope ? [scope, ''] : [''] } },
    });
    const snapByKey = new Map(snap.map((s) => [`${s.companyId}|${s.parentCode}|${s.profitCode}`, s]));
    // Base: live si disponible; si no, snapshot disponible (degradación elegante).
    const base: Array<{ code: string; description: string; parentCode: string; extra?: Record<string, unknown> }> = live
      ? live.map((r) => ({ code: r.code, description: r.description, parentCode: r.parentCode ?? '', extra: r.extra }))
      : snap
          .filter((s) => s.availableInProfit)
          .map((s) => ({ code: s.profitCode, description: s.description ?? s.profitCode, parentCode: s.parentCode }));
    const synchronizedAt = snap.reduce<string | null>(
      (acc, s) => {
        const t = s.synchronizedAt?.toISOString() ?? null;
        if (!t) return acc;
        return !acc || t > acc ? t : acc;
      },
      null,
    );
    return { base, snap, snapByKey, live: !!live, source, synchronizedAt };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyVisibility(
    scope: string,
    mode: VisibilityMode,
    uni: { base: Array<{ code: string; description: string; parentCode: string; extra?: Record<string, unknown> }>; snap: any[]; snapByKey: Map<string, any>; live: boolean },
    includeUnavailable: boolean,
  ): { items: EffectiveItem[] } {
    const { base, snap, snapByKey, live } = uni;
    // Visibilidad: específico > global; sin fila = oculto en SELECTED.
    const visibilityOf = (code: string, pc: string): { visible: boolean; isNew: boolean; synchronizedAt: string | null } => {
      const row = scope
        ? (snapByKey.get(`${scope}|${pc}|${code}`) ?? snapByKey.get(`|${pc}|${code}`))
        : snapByKey.get(`|${pc}|${code}`);
      if (mode === 'ALL') {
        return { visible: true, isNew: !row || !row.decided, synchronizedAt: row?.synchronizedAt?.toISOString() ?? null };
      }
      if (!row) return { visible: false, isNew: true, synchronizedAt: null };
      // Sincronizado pero sin decisión del admin = NUEVO / NO SELECCIONADO (§26).
      return { visible: row.visible, isNew: !row.decided, synchronizedAt: row.synchronizedAt?.toISOString() ?? null };
    };
    const items: EffectiveItem[] = base.map((b) => {
      const v = visibilityOf(b.code, b.parentCode);
      return {
        code: b.code, description: b.description, parentCode: b.parentCode,
        visible: v.visible, availableInProfit: true,
        isNew: v.isNew, synchronizedAt: v.synchronizedAt, extra: b.extra,
      };
    });
    // Desaparecidos de Profit con snapshot: NO DISPONIBLE (§27).
    if (live && includeUnavailable) {
      const liveKeys = new Set(base.map((b) => `${b.parentCode}|${b.code}`));
      for (const s of snap) {
        if (!liveKeys.has(`${s.parentCode}|${s.profitCode}`)) {
          const v = visibilityOf(s.profitCode, s.parentCode);
          items.push({
            code: s.profitCode, description: s.description ?? s.profitCode,
            parentCode: s.parentCode, visible: false,
            availableInProfit: false, isNew: false,
            synchronizedAt: v.synchronizedAt,
          });
        }
      }
    }
    return { items };
  }

  /**
   * Vista administrativa: TODOS los elementos conocidos (visibles, ocultos,
   * nuevos y no disponibles) con banderas, búsqueda y paginación (§29-30).
   */
  async getAdminView(
    catalogType: string,
    opts: { companyId?: string; search?: string; page?: number; limit?: number } = {},
  ): Promise<{ items: EffectiveItem[]; total: number; page: number; limit: number; mode: VisibilityMode; source: EffectiveCatalog['source']; synchronizedAt: string | null }> {
    this.assertType(catalogType);
    const scope = this.scope(opts.companyId);
    await this.assertCompany(scope);
    const q = (opts.search ?? '').trim().toLowerCase();
    const mode = await this.getMode(catalogType, opts.companyId);
    const uni = await this.getRawUniverse(catalogType, scope);
    if (!uni.live && uni.base.length === 0) {
      throw new ServiceUnavailableException('No fue posible consultar el catálogo de Profit.');
    }
    let items = this.applyVisibility(scope, mode, uni, true).items;
    if (q) items = items.filter((i) => i.code.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    items.sort((a, b) => a.code.localeCompare(b.code));
    const total = items.length;
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const page = Math.max(opts.page ?? 1, 1);
    return {
      items: items.slice((page - 1) * limit, page * limit),
      total, page, limit, mode, source: uni.source, synchronizedAt: uni.synchronizedAt,
    };
  }

  /** ¿Visible para operar? (padre incluido en SUBGROUP). NO valida existencia. */
  async isVisible(    catalogType: CatalogType,
    code: string,
    opts: { companyId?: string; parentCode?: string } = {},
  ): Promise<boolean> {
    const eff = await this.getEffective(catalogType, { companyId: opts.companyId });
    const c = code.trim();
    if (catalogType === 'SUBGROUP' && opts.parentCode !== undefined) {
      return eff.items.some((i) => i.code === c && i.parentCode === opts.parentCode!.trim());
    }
    return eff.items.some((i) => i.code === c);
  }

  /**
   * Existencia real en Profit con fallback a snapshot (mensajes §61).
   * Retorna descripción para mensajes e historial. `live=false` + `exists=false`
   * significa Profit inaccesible sin snapshot (causa C), no inexistencia.
   */
  async checkExists(
    catalogType: CatalogType,
    code: string,
    opts: { parentCode?: string } = {},
  ): Promise<{ exists: boolean; description: string | null; live: boolean }> {
    const c = code.trim();
    try {
      const single = await this.fetchOne(catalogType, c, opts.parentCode);
      // Profit alcanzable: su respuesta es autoritativa (null = no existe).
      if (single) return { exists: true, description: single.description, live: true };
      return { exists: false, description: null, live: true };
    } catch {
      // Profit caído: fallback a snapshot disponible.
      const snap = await this.prisma.catalogVisibilityItem.findFirst({
        where: { catalogType, profitCode: c, availableInProfit: true },
      });
      if (snap) return { exists: true, description: snap.description, live: false };
      return { exists: false, description: null, live: false };
    }
  }

  private async fetchOne(
    catalogType: CatalogType,
    code: string,
    parentCode?: string,
  ): Promise<{ description: string } | null> {
    if (!this.profit) throw new ServiceUnavailableException('Adapter Profit no disponible');
    switch (catalogType) {
      case 'GROUP': {
        const g = await this.profit.getGroup(code);
        return g ? { description: ((g.lin_des ?? '') as string).trim() || code } : null;
      }
      case 'SUBGROUP': {
        if (!parentCode) return null;
        const s = await this.profit.getSubgroup(parentCode, code);
        return s ? { description: ((s.subl_des ?? '') as string).trim() || code } : null;
      }
      case 'CATEGORY': {
        const c = await this.profit.getCategory(code);
        return c ? { description: ((c.cat_des ?? '') as string).trim() || code } : null;
      }
      case 'BRAND': {
        const b = await this.profit.getBrand(code);
        return b ? { description: ((b.des_col ?? '') as string).trim() || code } : null;
      }
      case 'UNIT': {
        const u = await this.profit.getUnit(code);
        return u ? { description: (((u as { des_uni?: string }).des_uni ?? '') as string).trim() || code } : null;
      }
      case 'TAX': {
        const rows = await this.profit.getTaxTypes();
        const t = rows.find((r) => (r.tipo ?? '').trim() === code);
        return t ? { description: (t.descripcio ?? '').trim() || code } : null;
      }
      case 'ARTICLE_TYPE': {
        const rows = await this.profit.getArticleTypes();
        const t = rows.find((r) => (r.code ?? '').trim() === code);
        return t ? { description: (t.label ?? '').trim() || code } : null;
      }
    }
  }

  private async audit(
    actorId: string,
    actorCompanyId: string | undefined,
    action: string,
    entityId: string,
    after: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditEvent.create({
      data: {
        correlationId: entityId,
        actorId,
        actorCompanyId: actorCompanyId ?? null,
        entityType: 'CatalogVisibility',
        entityId,
        action,
        afterData: JSON.stringify(after),
      },
    });
  }
}
