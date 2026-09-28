import { describe, it, expect, vi } from 'vitest';
import { CORPORATE_CATALOGS } from '../src/modulos/profit/corporate-catalogs';
import {
  NO_EQUIVALENCES,
  PAYLOAD_FK_COLUMNS,
  buildEquivalenceMap,
  equivalenceKey,
  resolveCodeWithMap,
  resolvePayloadWithMap,
  validateEquivalence,
  type EquivalenceRecord,
} from '../src/modulos/profit/corporate-equivalence';
import { CorporateEquivalenceService } from '../src/modulos/profit/corporate-equivalence.service';
import { buildProfitArticlePayload } from '../src/modulos/profit/profit-article.payload';
import { compareCatalogRows, buildSyncPlanItem, summarizePlan, isPlanExecutable } from '../src/modulos/profit/corporate-compare';

// ---------------------------------------------------------------------------
// FASE 26 — Equivalencias de catálogo entre empresas.
// Puras: resolución, validación y plan. Cero escrituras en Profit.
// ---------------------------------------------------------------------------

const rows = (map: Record<string, string>, companyCode = 'AD_DISAY'): EquivalenceRecord[] =>
  Object.entries(map).map(([standardCode, localCode]) => ({
    id: `${companyCode}-${standardCode}`,
    catalogKey: 'lin_art',
    companyCode,
    standardCode,
    localCode,
    active: true,
    note: null,
    createdBy: 'u1',
  }));

describe('FASE 26 — validación de equivalencias (fail-closed)', () => {
  it('acepta un vínculo explícito y normaliza', () => {
    expect(validateEquivalence({
      catalogKey: 'lin_art', companyCode: 'ad_disay', standardCode: ' 01 ', localCode: '01A',
    })).toEqual({ catalogKey: 'lin_art', companyCode: 'AD_DISAY', standardCode: '01', localCode: '01A', note: null });
  });

  it('rechaza catálogo desconocido, estándar contra sí mismo y códigos iguales', () => {
    expect(() => validateEquivalence({ catalogKey: 'inventado', companyCode: 'AD_DISAY', standardCode: '01', localCode: '01A' })).toThrow();
    expect(() => validateEquivalence({ catalogKey: 'lin_art', companyCode: 'AD_TRANS', standardCode: '01', localCode: '01A' })).toThrow();
    expect(() => validateEquivalence({ catalogKey: 'lin_art', companyCode: 'AD_DISAY', standardCode: '01', localCode: '01' })).toThrow();
  });

  it('rechaza códigos con formato sospechoso o vacíos', () => {
    expect(() => validateEquivalence({ catalogKey: 'lin_art', companyCode: 'AD_DISAY', standardCode: '', localCode: '01A' })).toThrow();
    expect(() => validateEquivalence({ catalogKey: 'lin_art', companyCode: 'AD_DISAY', standardCode: '01', localCode: "01A'; DROP" })).toThrow();
    expect(() => validateEquivalence({ catalogKey: 'lin_art', companyCode: 'AD_DISAY; DROP', standardCode: '01', localCode: '01A' })).toThrow();
  });
});

describe('FASE 26 — índice y resolución pura', () => {
  it('la clave separa catálogo, empresa y código canónico', () => {
    expect(equivalenceKey('lin_art', 'ad_disay', '01')).toBe('lin_art|AD_DISAY|01');
  });

  it('ignora las equivalencias desactivadas (borrado lógico)', () => {
    const map = buildEquivalenceMap([...rows({ '01': '01A' }), { ...rows({ '02': '02B' })[0]!, active: false }]);
    expect(resolveCodeWithMap(map, 'lin_art', 'AD_DISAY', '01')).toBe('01A');
    expect(resolveCodeWithMap(map, 'lin_art', 'AD_DISAY', '02')).toBe('02');
  });

  it('sin equivalencia devuelve el código canónico tal cual', () => {
    expect(resolveCodeWithMap(buildEquivalenceMap([]), 'lin_art', 'AD_DISAY', '01')).toBe('01');
    expect(NO_EQUIVALENCES.resolvePayload).toBeTypeOf('function');
  });

  it('traduce solo las claves foráneas: el código del artículo y la data se mantienen', () => {
    const payload = buildProfitArticlePayload('FERMIS0664', {
      description: 'TORNILLO HEX', articleType: 'C', groupCode: 'FER', subgroupCode: 'MIS',
      unitCode: 'UND', taxType: '1', integrationUser: 'DM', disCen: '0101J1',
    });
    const map = buildEquivalenceMap(rows({ FER: 'FERRO' }));
    const out = resolvePayloadWithMap(payload, map, 'AD_DISAY');
    expect(out.co_lin).toBe('FERRO');
    expect(out.co_art).toBe('FERMIS0664');
    expect(out.art_des).toBe('TORNILLO HEX');
    expect(out.tipo).toBe('C');
    expect(out.dis_cen).toBe('0101J1');
    expect(out.co_us_in).toBe('DM');
    expect(out.co_subl).toBe('MIS');
  });

  it('cubre las nueve claves foráneas del contrato', () => {
    expect(PAYLOAD_FK_COLUMNS.map((c) => c.column).sort()).toEqual(
      ['co_cat', 'co_color', 'co_lin', 'co_prov', 'co_subl', 'procedenci', 'suni_venta', 'tipo_imp', 'uni_venta'].sort(),
    );
  });
});

describe('FASE 26 — comparación y plan con equivalencias', () => {
  it('el destino ya lo tiene con otro código → EQUIVALENTE, sin INSERT', () => {
    const diffs = compareCatalogRows('Líneas', [{ code: '01', description: 'HERRAMIENTAS' }], [
      { code: '01A', description: 'HERRAMIENTAS' },
    ], { equivalences: new Map([['01', '01A']]) });
    expect(diffs[0]!.state).toBe('EQUIVALENTE');
    expect(diffs[0]!.destCode).toBe('01A');
    const item = buildSyncPlanItem(diffs[0]!, CORPORATE_CATALOGS['lin_art']);
    expect(item.operation).toBe('NO_ACTION');
    expect(item.safe).toBe(true);
    expect(item.reason).toContain('01A');
  });

  it('el código local aún no existe → INSERT del código LOCAL', () => {
    const diffs = compareCatalogRows('Líneas', [{ code: '01', description: 'HERRAMIENTAS' }], [], {
      equivalences: new Map([['01', '01A']]),
    });
    expect(diffs[0]!.state).toBe('FALTA_EN_DESTINO');
    expect(diffs[0]!.destCode).toBe('01A');
    const item = buildSyncPlanItem(diffs[0]!, CORPORATE_CATALOGS['lin_art']);
    expect(item.operation).toBe('INSERT');
    expect(item.reason).toContain('01A');
  });

  it('el padre de la sublínea se traduce antes de comparar', () => {
    const diffs = compareCatalogRows(
      'Sublíneas',
      [{ code: 'MIS', description: 'Misceláneo', parent: 'FER' }],
      [{ code: 'MIS', description: 'Misceláneo', parent: 'FERRO' }],
      { parentAware: true, equivalences: new Map(), parentEquivalences: new Map([['FER', 'FERRO']]) },
    );
    expect(diffs[0]!.state).toBe('IGUAL');
  });

  it('sin equivalencia el comportamiento previo se mantiene (crea el canónico)', () => {
    const diffs = compareCatalogRows('Líneas', [{ code: 'FER', description: 'Ferretería' }], []);
    expect(diffs[0]!.destCode).toBeUndefined();
    expect(buildSyncPlanItem(diffs[0]!, CORPORATE_CATALOGS['lin_art']).operation).toBe('INSERT');
  });

  it('el resumen cuenta los equivalentes aparte y el plan sigue siendo ejecutable', () => {
    const items = [
      buildSyncPlanItem({ catalog: 'L', code: '01', standardValue: 'a', destValue: 'a', state: 'EQUIVALENTE', destCode: '01A' }),
      buildSyncPlanItem({ catalog: 'L', code: '02', standardValue: 'b', destValue: null, state: 'FALTA_EN_DESTINO' }),
    ];
    const s = summarizePlan(items);
    expect(s.equivalentes).toBe(1);
    expect(s.faltantes).toBe(1);
    expect(isPlanExecutable(items)).toBe(true);
  });
});

describe('FASE 26 — servicio de equivalencias', () => {
  function build() {
    const store: any[] = [];
    const audit: any[] = [];
    const prisma: any = {
      catalogCodeEquivalence: {
        findMany: async ({ where }: any = {}) => store.filter((r) => {
          if (where?.companyCode && r.companyCode !== where.companyCode) return false;
          if (where?.active !== undefined && r.active !== where.active) return false;
          return true;
        }),
        findUnique: async ({ where }: any) => {
          if (where?.id) return store.find((r) => r.id === where.id) ?? null;
          const w = where.catalogKey_companyCode_standardCode;
          return store.find((r) => r.catalogKey === w.catalogKey && r.companyCode === w.companyCode && r.standardCode === w.standardCode) ?? null;
        },
        upsert: async ({ where, create, update }: any) => {
          const w = where.catalogKey_companyCode_standardCode;
          const i = store.findIndex((r) => r.catalogKey === w.catalogKey && r.companyCode === w.companyCode && r.standardCode === w.standardCode);
          if (i >= 0) { store[i] = { ...store[i]!, ...update }; return store[i]; }
          const row = { id: `eq-${store.length + 1}`, ...create };
          store.push(row);
          return row;
        },
        update: async ({ where, data }: any) => {
          const i = store.findIndex((r) => r.id === where.id);
          store[i] = { ...store[i]!, ...data };
          return store[i];
        },
      },
    };
    const auditoria: any = { logEvent: vi.fn(async (e: any) => { audit.push(e); return e; }) };
    const readAdapter: any = { rawQuery: vi.fn(async () => []) };
    const service = new CorporateEquivalenceService(prisma, auditoria, readAdapter);
    return { service, store, audit, readAdapter, prisma };
  }

  it('registra, resuelve y audita una equivalencia', async () => {
    const { service, audit } = build();
    const row = await service.upsert({ catalogKey: 'lin_art', companyCode: 'AD_DISAY', standardCode: '01', localCode: '01A' }, 'u1');
    expect(row.localCode).toBe('01A');
    expect(row.catalogLabel).toBe('Líneas');
    expect(await service.resolveCode('AD_DISAY', 'lin_art', '01')).toBe('01A');
    expect(await service.resolveCode('AD_DISAY', 'lin_art', '99')).toBe('99');
    expect(audit.some((e) => e.action === 'CORPORATE_EQUIVALENCE_CREATED')).toBe(true);
  });

  it('el estándar no se equivivoca consigo mismo y un alta inválida no escribe', async () => {
    const { service, store } = build();
    await expect(service.upsert({ catalogKey: 'lin_art', companyCode: 'AD_TRANS', standardCode: '01', localCode: '01A' }, 'u1')).rejects.toThrow();
    await expect(service.upsert({ catalogKey: 'nope', companyCode: 'AD_DISAY', standardCode: '01', localCode: '01A' }, 'u1')).rejects.toThrow();
    expect(store).toHaveLength(0);
  });

  it('actualiza en vez de duplicar el mismo vínculo canónico', async () => {
    const { service, store, audit } = build();
    await service.upsert({ catalogKey: 'lin_art', companyCode: 'AD_DISAY', standardCode: '01', localCode: '01A' }, 'u1');
    await service.upsert({ catalogKey: 'lin_art', companyCode: 'AD_DISAY', standardCode: '01', localCode: '01B' }, 'u1');
    expect(store).toHaveLength(1);
    expect(store[0]!.localCode).toBe('01B');
    expect(audit.some((e) => e.action === 'CORPORATE_EQUIVALENCE_UPDATED')).toBe(true);
  });

  it('desactivar saca la equivalencia de la resolución sin borrarla', async () => {
    const { service } = build();
    const created = await service.upsert({ catalogKey: 'lin_art', companyCode: 'AD_DISAY', standardCode: '01', localCode: '01A' }, 'u1');
    const off = await service.deactivate(created.id, 'u1');
    expect(off.active).toBe(false);
    expect(await service.resolveCode('AD_DISAY', 'lin_art', '01')).toBe('01');
  });

  it('traduce el payload por empresa sin tocar el código del artículo', async () => {
    const { service } = build();
    await service.upsert({ catalogKey: 'lin_art', companyCode: 'AD_DISAY', standardCode: 'FER', localCode: 'FERRO' }, 'u1');
    const payload = buildProfitArticlePayload('FERMIS0664', {
      description: 'TORNILLO', articleType: 'C', groupCode: 'FER', subgroupCode: 'MIS',
      unitCode: 'UND', taxType: '1', integrationUser: 'DM',
    });
    const local = await service.resolvePayload('AD_DISAY', payload);
    expect(local.co_lin).toBe('FERRO');
    expect(local.co_art).toBe('FERMIS0664');
    const other = await service.resolvePayload('AD_ROMA', payload);
    expect(other.co_lin).toBe('FER');
  });

  it('sugiere el vínculo cuando la descripción coincide (solo lectura)', async () => {
    const { service, readAdapter } = build();
    readAdapter.rawQuery = vi.fn(async (sql: string) => {
      const db = /\[(AD_[A-Z0-9_]+)\]\.dbo/i.exec(sql)?.[1]?.toUpperCase() ?? '';
      const isLine = /\.dbo\.\[lin_art\]/i.test(sql);
      if (!isLine) return [];
      if (db === 'AD_TRANS') return [{ code: '01', description: 'HERRAMIENTAS' }, { code: '02', description: 'PINTURAS' }];
      if (db === 'AD_DISAY') return [{ code: '01A', description: 'HERRAMIENTAS' }];
      return [];
    });
    const s = await service.suggest('AD_DISAY');
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ catalogKey: 'lin_art', standardCode: '01', localCode: '01A' });
  });
});
