import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CatalogVisibilityService } from '../src/modulos/catalogos/catalog-visibility.service';
import { CatalogosService } from '../src/modulos/catalogos/catalogos.service';
import { CatalogConfigController } from '../src/modulos/catalogos/catalog-config.controller';
import { CatalogEffectiveController } from '../src/modulos/catalogos/catalog-effective.controller';
import { REQUIRE_PERMISSION_KEY } from '../src/modulos/autenticacion/require-permission.decorator';

/**
 * FASE CAT — visibilidad de catálogos Profit + fuente única de validación.
 * Profit simulado: AGR/FER/REP/LUB (+HER/FER/SEM bajo AGR). Local vacío.
 */

const GROUPS = [
  { co_lin: 'AGR', lin_des: 'INSUMOS AGRICOLA' },
  { co_lin: 'FER', lin_des: 'FERRETERIA' },
  { co_lin: 'REP', lin_des: 'REPUESTOS' },
  { co_lin: 'LUB', lin_des: 'LUBRICANTES' },
];
const SUBGROUPS = [
  { co_lin: 'AGR', co_subl: 'HER', subl_des: 'HERBICIDAS' },
  { co_lin: 'AGR', co_subl: 'FER', subl_des: 'FERTILIZANTES' },
  { co_lin: 'AGR', co_subl: 'SEM', subl_des: 'SEMILLAS' },
  { co_lin: 'FER', co_subl: 'MIS', subl_des: 'MISCELANEOS' },
];

function profitMock() {
  const trim = (v: string) => (v ?? '').trim();
  return {
    getGroups: vi.fn(async () => GROUPS),
    getGroup: vi.fn(async (c: string) => GROUPS.find((g) => g.co_lin === trim(c)) ?? null),
    getSubgroups: vi.fn(async () => SUBGROUPS),
    getSubgroup: vi.fn(async (l: string, s: string) =>
      SUBGROUPS.find((x) => x.co_lin === trim(l) && x.co_subl === trim(s)) ?? null),
    getCategories: vi.fn(async () => [{ co_cat: '01', cat_des: 'NO APLICA' }]),
    getCategory: vi.fn(async (c: string) => (trim(c) === '01' ? { co_cat: '01', cat_des: 'NO APLICA' } : null)),
    getBrands: vi.fn(async () => [{ co_col: '01', des_col: 'NO APLICA' }]),
    getBrand: vi.fn(async (c: string) => (trim(c) === '01' ? { co_col: '01', des_col: 'NO APLICA' } : null)),
    getUnits: vi.fn(async () => [{ co_uni: 'UND', des_uni: 'UNIDAD' }]),
    getUnit: vi.fn(async (c: string) => (trim(c) === 'UND' ? { co_uni: 'UND', des_uni: 'UNIDAD' } : null)),
    getTaxTypes: vi.fn(async () => [{ tipo: '1', descripcio: 'GENERAL' }]),
    getArticleTypes: vi.fn(async () => [{ code: 'C', label: 'Consumo', functional: true, usageCount: 3 }]),
  };
}

function prismaMock() {
  const modes: any[] = [];
  const items: any[] = [];
  const audits: any[] = [];
  const groups: any[] = [];
  const subgroups: any[] = [];
  const findMode = (t: string, c: string) => modes.find((m) => m.catalogType === t && m.companyId === c) ?? null;
  return {
    store: { modes, items, audits, groups, subgroups },
    company: { findUnique: vi.fn(async ({ where }: any) => (['c1', 'c2'].includes(where.id) ? { id: where.id } : null)) },
    catalogVisibilityMode: {
      findUnique: vi.fn(async ({ where }: any) => findMode(where.catalogType_companyId.catalogType, where.catalogType_companyId.companyId)),
      upsert: vi.fn(async (a: any) => {
        const k = a.where.catalogType_companyId;
        let m = findMode(k.catalogType, k.companyId);
        if (m) Object.assign(m, a.update);
        else { m = { id: 'm1', ...a.create }; modes.push(m); }
        return m;
      }),
    },
    catalogVisibilityItem: {
      findMany: vi.fn(async ({ where }: any) => items.filter((i) =>
        (!where.catalogType || i.catalogType === where.catalogType) &&
        (where.companyId?.in ? where.companyId.in.includes(i.companyId) : true) &&
        (where.availableInProfit === undefined || i.availableInProfit === where.availableInProfit),
      )),
      findFirst: vi.fn(async ({ where }: any) => items.find((i) =>
        Object.entries(where).every(([k, v]) => (i as any)[k] === v),
      ) ?? null),
      upsert: vi.fn(async (a: any) => {
        const k = a.where.catalogType_profitCode_parentCode_companyId;
        let it = items.find((i) => i.catalogType === k.catalogType && i.profitCode === k.profitCode && i.parentCode === k.parentCode && i.companyId === k.companyId);
        if (it) Object.assign(it, a.update);
        else { it = { id: `i${items.length}`, ...a.create }; items.push(it); }
        return it;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let n = 0;
        for (const i of items) {
          if (Object.entries(where).every(([k, v]) => (i as any)[k] === v)) { Object.assign(i, data); n += 1; }
        }
        return { count: n };
      }),
    },
    catalogGroup: {
      findUnique: vi.fn(async ({ where }: any) => groups.find((g) => g.code === where.code) ?? null),
      create: vi.fn(async (a: any) => { const g = { id: `g${groups.length}`, ...a.data }; groups.push(g); return g; }),
      update: vi.fn(async (a: any) => {
        const g = groups.find((x) => x.code === a.where.code)!;
        Object.assign(g, a.data);
        return g;
      }),
    },
    catalogSubgroup: {
      findFirst: vi.fn(async ({ where }: any) => subgroups.find((s) => s.groupId === where.groupId && s.code === where.code) ?? null),
      create: vi.fn(async (a: any) => { const s = { id: `s${subgroups.length}`, ...a.data }; subgroups.push(s); return s; }),
      update: vi.fn(async (a: any) => {
        const s = subgroups.find((x) => x.id === a.where.id)!;
        Object.assign(s, a.data);
        return s;
      }),
    },
    catalogCategory: { findFirst: vi.fn(async () => null), create: vi.fn(async (a: any) => ({ id: 'c1', ...a.data })) },
    brand: { findFirst: vi.fn(async () => null), create: vi.fn(async (a: any) => ({ id: 'b1', ...a.data })) },
    auditEvent: { create: vi.fn(async (a: any) => { audits.push(a.data); return {}; }) },
  };
}

function makeService() {
  const prisma: any = prismaMock();
  const profit: any = profitMock();
  const svc = new CatalogVisibilityService(prisma, profit);
  return { svc, prisma, profit };
}

describe('CAT — caso AGR (selector y validador, misma fuente)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => { ctx = makeService(); });

  it('1-4. Profit devuelve AGR; efectivo lo contiene; validar acepta; master usa AGR', async () => {
    const eff = await ctx.svc.getEffective('GROUP', {});
    expect(eff.items.map((i) => i.code)).toContain('AGR');
    expect(eff.items.find((i) => i.code === 'AGR')?.description).toBe('INSUMOS AGRICOLA');
    expect(eff.mode).toBe('ALL');

    const catalogos = new CatalogosService(ctx.prisma, ctx.profit, ctx.svc);
    const tx = {
      catalogGroup: ctx.prisma.catalogGroup,
      catalogSubgroup: ctx.prisma.catalogSubgroup,
      catalogCategory: ctx.prisma.catalogCategory,
      brand: ctx.prisma.brand,
    };
    // 6. Validación reconoce AGR (ya no "inexistente en catálogo local").
    const r = await catalogos.resolveClassification(tx, { groupCode: 'AGR', subgroupCode: 'HER' });
    expect(r.groupId).toBeDefined();
    expect(ctx.prisma.store.groups.map((g: any) => g.code)).toContain('AGR');
    // 5/7. Sin error ambiguo.
  });

  it('7. error anterior desaparece como consecuencia de la arquitectura', async () => {
    const catalogos = new CatalogosService(ctx.prisma, ctx.profit, ctx.svc);
    const tx = {
      catalogGroup: ctx.prisma.catalogGroup,
      catalogSubgroup: ctx.prisma.catalogSubgroup,
      catalogCategory: ctx.prisma.catalogCategory,
      brand: ctx.prisma.brand,
    };
    await expect(catalogos.resolveClassification(tx, { groupCode: 'AGR', subgroupCode: 'HER' })).resolves.toBeDefined();
  });

  it('combinación inválida AGR + subgrupo de FER se rechaza', async () => {
    const catalogos = new CatalogosService(ctx.prisma, ctx.profit, ctx.svc);
    const tx = {
      catalogGroup: ctx.prisma.catalogGroup,
      catalogSubgroup: ctx.prisma.catalogSubgroup,
      catalogCategory: ctx.prisma.catalogCategory,
      brand: ctx.prisma.brand,
    };
    await expect(catalogos.resolveClassification(tx, { groupCode: 'AGR', subgroupCode: 'MIS' }))
      .rejects.toThrow(/no pertenece al grupo/);
  });

  it('grupo inexistente en Profit: mensaje A preciso', async () => {
    const catalogos = new CatalogosService(ctx.prisma, ctx.profit, ctx.svc);
    const tx = {
      catalogGroup: ctx.prisma.catalogGroup,
      catalogSubgroup: ctx.prisma.catalogSubgroup,
      catalogCategory: ctx.prisma.catalogCategory,
      brand: ctx.prisma.brand,
    };
    await expect(catalogos.resolveClassification(tx, { groupCode: 'ZZZ', subgroupCode: 'HER' }))
      .rejects.toThrow('El grupo ZZZ no existe en Profit.');
  });
});

describe('CAT — modos ALL / SELECTED', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => { ctx = makeService(); });

  it('TODOS: todo lo activo aparece', async () => {
    const eff = await ctx.svc.getEffective('GROUP', {});
    expect(eff.items.map((i) => i.code).sort()).toEqual(['AGR', 'FER', 'LUB', 'REP']);
  });

  it('SELECCIONADOS: solo marcados; oculto no aparece y backend lo rechaza', async () => {
    await ctx.svc.setMode('GROUP', 'SELECTED', { actorId: 'admin' });
    await ctx.svc.setItemsVisible('GROUP', [{ code: 'AGR' }, { code: 'FER' }, { code: 'REP' }], true, { actorId: 'admin' });
    const eff = await ctx.svc.getEffective('GROUP', {});
    expect(eff.items.map((i) => i.code).sort()).toEqual(['AGR', 'FER', 'REP']);
    expect(eff.items.map((i) => i.code)).not.toContain('LUB');
    const catalogos = new CatalogosService(ctx.prisma, ctx.profit, ctx.svc);
    const tx = {
      catalogGroup: ctx.prisma.catalogGroup,
      catalogSubgroup: ctx.prisma.catalogSubgroup,
      catalogCategory: ctx.prisma.catalogCategory,
      brand: ctx.prisma.brand,
    };
    await expect(catalogos.resolveClassification(tx, { groupCode: 'LUB', subgroupCode: 'X' }))
      .rejects.toThrow('El grupo LUB existe en Profit pero está deshabilitado para Data-Maestra.');
  });

  it('cambio de modo no borra la selección (ida y vuelta)', async () => {
    await ctx.svc.setMode('GROUP', 'SELECTED', { actorId: 'admin' });
    await ctx.svc.setItemsVisible('GROUP', [{ code: 'AGR' }], true, { actorId: 'admin' });
    await ctx.svc.setMode('GROUP', 'ALL', { actorId: 'admin' });
    expect((await ctx.svc.getEffective('GROUP', {})).items.map((i) => i.code)).toContain('LUB');
    await ctx.svc.setMode('GROUP', 'SELECTED', { actorId: 'admin' });
    expect((await ctx.svc.getEffective('GROUP', {})).items.map((i) => i.code)).toEqual(['AGR']);
  });
});

describe('CAT — jerarquía grupo/subgrupo', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => { ctx = makeService(); });

  it('subgrupo filtra por padre y respeta visibilidad', async () => {
    await ctx.svc.setMode('GROUP', 'SELECTED', { actorId: 'admin' });
    await ctx.svc.setItemsVisible('GROUP', [{ code: 'AGR' }], true, { actorId: 'admin' });
    await ctx.svc.setMode('SUBGROUP', 'SELECTED', { actorId: 'admin' });
    await ctx.svc.setItemsVisible('SUBGROUP', [{ code: 'HER', parentCode: 'AGR' }, { code: 'SEM', parentCode: 'AGR' }], true, { actorId: 'admin' });
    const eff = await ctx.svc.getEffective('SUBGROUP', { parentCode: 'AGR' });
    expect(eff.items.map((i) => i.code).sort()).toEqual(['HER', 'SEM']);
    expect(eff.items.map((i) => i.code)).not.toContain('FER');
  });

  it('grupo oculto oculta sus subgrupos aunque estén marcados', async () => {
    await ctx.svc.setMode('GROUP', 'SELECTED', { actorId: 'admin' });
    await ctx.svc.setItemsVisible('GROUP', [{ code: 'FER' }], true, { actorId: 'admin' });
    await ctx.svc.setMode('SUBGROUP', 'SELECTED', { actorId: 'admin' });
    await ctx.svc.setItemsVisible('SUBGROUP', [{ code: 'HER', parentCode: 'AGR' }], true, { actorId: 'admin' });
    const eff = await ctx.svc.getEffective('SUBGROUP', {});
    expect(eff.items.map((i) => i.code)).not.toContain('HER');
  });

  it('al reaparecer el padre, los subgrupos configurados reaparecen', async () => {
    await ctx.svc.setMode('GROUP', 'SELECTED', { actorId: 'admin' });
    await ctx.svc.setMode('SUBGROUP', 'SELECTED', { actorId: 'admin' });
    await ctx.svc.setItemsVisible('SUBGROUP', [{ code: 'HER', parentCode: 'AGR' }], true, { actorId: 'admin' });
    expect((await ctx.svc.getEffective('SUBGROUP', {})).items).toHaveLength(0);
    await ctx.svc.setItemsVisible('GROUP', [{ code: 'AGR' }], true, { actorId: 'admin' });
    expect((await ctx.svc.getEffective('SUBGROUP', {})).items.map((i) => i.code)).toEqual(['HER']);
  });
});

describe('CAT — nuevos, sincronización y multiempresa', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => { ctx = makeService(); });

  it('sync detecta nuevos; en SELECTED quedan no seleccionados', async () => {
    await ctx.svc.setMode('GROUP', 'SELECTED', { actorId: 'admin' });
    const rep = await ctx.svc.syncCatalog('GROUP', { actorId: 'admin' });
    expect(rep.total).toBe(4);
    expect(rep.created).toBe(4);
    const eff = await ctx.svc.getEffective('GROUP', {});
    expect(eff.items).toHaveLength(0);
    const admin = await ctx.svc.getAdminView('GROUP', {});
    expect(admin.items.find((i) => i.code === 'REP')?.isNew).toBe(true);
    await ctx.svc.setItemsVisible('GROUP', [{ code: 'REP' }], true, { actorId: 'admin' });
    expect((await ctx.svc.getEffective('GROUP', {})).items.map((i) => i.code)).toEqual(['REP']);
  });

  it('desaparecido de Profit se marca no disponible sin borrar', async () => {
    await ctx.svc.syncCatalog('GROUP', { actorId: 'admin' });
    // Profit deja de devolver AGR/REP/LUB de forma persistente.
    ctx.profit.getGroups.mockResolvedValue([{ co_lin: 'FER', lin_des: 'FERRETERIA' }]);
    const rep = await ctx.svc.syncCatalog('GROUP', { actorId: 'admin' });
    expect(rep.unavailable).toBeGreaterThanOrEqual(3);
    const admin = await ctx.svc.getAdminView('GROUP', {});
    const agr = admin.items.find((i) => i.code === 'AGR');
    expect(agr?.availableInProfit).toBe(false);
    expect(admin.items.map((i) => i.code)).toContain('AGR');
  });

  it('configuración de A no afecta a B', async () => {
    await ctx.svc.setMode('GROUP', 'SELECTED', { actorId: 'admin', companyId: 'c1' });
    await ctx.svc.setItemsVisible('GROUP', [{ code: 'AGR' }], true, { actorId: 'admin', companyId: 'c1' });
    expect((await ctx.svc.getEffective('GROUP', { companyId: 'c1' })).items.map((i) => i.code)).toEqual(['AGR']);
    expect((await ctx.svc.getEffective('GROUP', { companyId: 'c2' })).items.map((i) => i.code).sort())
      .toEqual(['AGR', 'FER', 'LUB', 'REP']);
  });

  it('auditoría registra modo, habilitación y sync', async () => {
    await ctx.svc.setMode('GROUP', 'SELECTED', { actorId: 'admin' });
    await ctx.svc.setItemsVisible('GROUP', [{ code: 'AGR' }], true, { actorId: 'admin' });
    await ctx.svc.setItemsVisible('GROUP', [{ code: 'AGR' }], false, { actorId: 'admin' });
    await ctx.svc.syncCatalog('GROUP', { actorId: 'admin' });
    const actions = ctx.prisma.store.audits.map((a: any) => a.action);
    expect(actions).toContain('CATALOG_VISIBILITY_MODE_CHANGED');
    expect(actions).toContain('CATALOG_ITEM_ENABLED');
    expect(actions).toContain('CATALOG_ITEM_DISABLED');
    expect(actions).toContain('CATALOG_SYNCED');
  });
});

describe('CAT — seguridad (backend autoridad)', () => {
  it('admin exige ADMIN.MANAGE; efectivo exige DASHBOARD.VIEW', () => {
    const adminPerm = (m: string): string[] =>
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, CatalogConfigController.prototype[m]) ?? [];
    expect(adminPerm('vista')).toEqual(['ADMIN.MANAGE']);
    expect(adminPerm('modo')).toEqual(['ADMIN.MANAGE']);
    expect(adminPerm('items')).toEqual(['ADMIN.MANAGE']);
    expect(adminPerm('sincronizar')).toEqual(['ADMIN.MANAGE']);
    const effPerm = (m: string): string[] =>
      Reflect.getMetadata(REQUIRE_PERMISSION_KEY, CatalogEffectiveController.prototype[m]) ?? [];
    for (const m of ['groups', 'subgroups', 'categories', 'brands', 'units', 'taxTypes', 'articleTypes']) {
      expect(effPerm(m)).toEqual(['DASHBOARD.VIEW']);
    }
  });

  it('tipo desconocido se rechaza', async () => {
    const ctx = makeService();
    await expect(ctx.svc.getEffective('NOPE', {})).rejects.toThrow(BadRequestException);
    await expect(ctx.svc.setMode('NOPE', 'ALL', { actorId: 'a' })).rejects.toThrow(BadRequestException);
  });

  it('empresa inexistente se rechaza', async () => {
    const ctx = makeService();
    await expect(ctx.svc.getEffective('GROUP', { companyId: 'cx' })).rejects.toThrow(BadRequestException);
  });
});
