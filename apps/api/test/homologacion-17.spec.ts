import { describe, it, expect, vi } from 'vitest';
import {
  STANDARD_COMPANY,
  normalizeCompanyList,
  assertValidCompanyName,
  dedupeCompanies,
  isStandardCompany,
} from '../src/modulos/profit/corporate-company';
import {
  CORPORATE_CATALOGS,
  CORPORATE_CATALOG_ORDER,
  companyTableRef,
  catalogSelectForCompany,
  catalogInsertForCompany,
  catalogUpdateDescForCompany,
} from '../src/modulos/profit/corporate-catalogs';
import {
  compareCatalogRows,
  buildSyncPlanItem,
  summarizePlan,
  isPlanExecutable,
  compareArticlePayload,
  evaluateGlobalPreflight,
} from '../src/modulos/profit/corporate-compare';
import { buildInsertStatement } from '../src/modulos/profit/profit-article.payload';
import { CorporateCompaniesService } from '../src/modulos/profit/corporate-companies.service';
import { CorporateHomologationService } from '../src/modulos/profit/corporate-homologation.service';

// ---------------------------------------------------------------------------
// FASE 17 §28 — Tests con mocks/fixtures. Cero escrituras reales en Profit:
// todo el SQL se ejecuta contra un modelo en memoria con semántica de
// transacción (commit/rollback), y el flag permanece en false.
// ---------------------------------------------------------------------------

describe('FASE 17 — empresas', () => {
  it('AD_TRANS es el estándar y AD_SLS está bien escrito', () => {
    expect(STANDARD_COMPANY).toBe('AD_TRANS');
    expect(isStandardCompany('ad_trans')).toBe(true);
    expect(isStandardCompany('AD_SLS')).toBe(false);
    expect(normalizeCompanyList(['ad_sls', ' AD_DIST ', 'AD_SLS'])).toEqual(['AD_SLS', 'AD_DIST']);
  });

  it('nombre inválido falla cerrado', () => {
    expect(() => assertValidCompanyName('AD_TRANS; DROP')).toThrow();
    expect(() => assertValidCompanyName('')).toThrow();
    expect(() => normalizeCompanyList(['AD_TRANS', 'x'.repeat(31)])).toThrow();
    expect(assertValidCompanyName('ad_dist')).toBe('AD_DIST');
  });

  it('descubre desde TEmpresas, marca estándar, deduce y filtra inválidos', async () => {
    const readFake = {
      rawQuery: async () => [
        { cod_emp: 'AD_TRANS', nombre: 'TRANSPORTE', rif: 'J1' },
        { cod_emp: 'AD_SLS', nombre: 'SUMINISTROS', rif: 'J2' },
        { cod_emp: 'AD_SLS', nombre: 'DUPLICADO', rif: 'J2' },
        { cod_emp: 'AD_NUEVA', nombre: 'NUEVA', rif: 'J3' },
        { cod_emp: 'MAL;NOMBRE', nombre: 'X', rif: 'J4' },
      ],
    };
    const svc = new CorporateCompaniesService(readFake as any);
    const list = await svc.listCompanies();
    expect(list.map((c) => c.code)).toEqual(['AD_TRANS', 'AD_NUEVA', 'AD_SLS']);
    expect(list[0]!.isStandard).toBe(true);
    expect(list[1]!.isStandard).toBe(false);
    // Nueva empresa aparece automáticamente (sin hardcodear).
    expect(list.some((c) => c.code === 'AD_NUEVA')).toBe(true);
  });

  it('dedupeCompanies ordena estándar primero', () => {
    const out = dedupeCompanies([
      { code: 'AD_ROMA', name: 'R', rif: '' },
      { code: 'AD_TRANS', name: 'T', rif: '' },
    ]);
    expect(out[0]!.code).toBe('AD_TRANS');
  });
});

describe('FASE 17 — catálogos y SQL builders', () => {
  it('orden de homologación respeta dependencias', () => {
    expect(CORPORATE_CATALOG_ORDER).toEqual([
      'tabulado', 'unidades', 'lin_art', 'sub_lin', 'cat_art', 'colores', 'prov', 'proceden',
    ]);
  });

  it('referencias three-part validadas, sin interpolación libre', () => {
    expect(companyTableRef('AD_DIST', 'art')).toBe('[AD_DIST].dbo.[art]');
    expect(() => companyTableRef('AD_DIST; DROP', 'art')).toThrow();
    expect(() => companyTableRef('AD_DIST', 'art; DROP')).toThrow();
  });

  it('select/insert/update por empresa', () => {
    const desc = CORPORATE_CATALOGS['sub_lin'];
    expect(catalogSelectForCompany(desc, 'AD_DIST')).toContain('[AD_DIST].dbo.[sub_lin]');
    const ins = catalogInsertForCompany(desc, 'AD_DIST', { integrationUser: 'DM' });
    expect(ins.sql).toBe('INSERT INTO [AD_DIST].dbo.[sub_lin] (co_subl, subl_des, co_lin, co_us_in) VALUES (@c0, @c1, @c2, @cu)');
    const tab = CORPORATE_CATALOGS['tabulado'];
    expect(catalogInsertForCompany(tab, 'AD_DIST', { integrationUser: 'DM' }).sql).not.toContain('co_us_in');
    expect(catalogUpdateDescForCompany(desc, 'AD_DIST')).toContain('UPDATE [AD_DIST].dbo.[sub_lin] SET subl_des = @c1');
  });

  it('INSERT de artículo acepta calificador y rechaza referencias libres', () => {
    const p: any = { co_art: 'X', art_des: 'Y', tipo: 'C', co_lin: 'A', co_subl: 'B', uni_venta: 'U', suni_venta: 'U', tipo_imp: '1', co_cat: '01', co_color: '01', procedenci: '01', co_prov: 'GEN', tipo_cos: 'ULCO', dis_cen: '', co_us_in: 'DM' };
    expect(buildInsertStatement(p).sql).toContain('INSERT INTO dbo.art');
    expect(buildInsertStatement(p, '[AD_DIST].dbo.[art]').sql).toContain('INSERT INTO [AD_DIST].dbo.[art]');
    expect(() => buildInsertStatement(p, 'AD_DIST.dbo.art')).toThrow();
  });
});

describe('FASE 17 — comparación y plan', () => {
  it('catálogo idéntico → IGUAL/NO_ACTION', () => {
    const std = [{ code: 'KG', description: 'Kilogramo' }];
    const diffs = compareCatalogRows('Unidades', std, [{ code: 'KG', description: 'Kilogramo' }]);
    expect(diffs[0]!.state).toBe('IGUAL');
    expect(buildSyncPlanItem(diffs[0]!).operation).toBe('NO_ACTION');
  });

  it('faltante → FALTA_EN_DESTINO/INSERT con mismo código', () => {
    const diffs = compareCatalogRows('Líneas', [{ code: 'FER', description: 'Ferretería' }], []);
    expect(diffs[0]!.state).toBe('FALTA_EN_DESTINO');
    const item = buildSyncPlanItem(diffs[0]!);
    expect(item.operation).toBe('INSERT');
    expect(item.code).toBe('FER');
    expect(item.safe).toBe(true);
  });

  it('solo descripción → UPDATE_DESCRIPTION sin tocar código', () => {
    const diffs = compareCatalogRows('Líneas', [{ code: 'FER', description: 'Ferretería' }], [{ code: 'FER', description: 'FERRETERIA' }]);
    expect(diffs[0]!.state).toBe('DESCRIPCION_DIFERENTE');
    expect(buildSyncPlanItem(diffs[0]!).operation).toBe('UPDATE_DESCRIPTION');
  });

  it('padre distinto → DATOS_DIFERENTES/BLOCKED (no adivina)', () => {
    const diffs = compareCatalogRows(
      'Sublíneas',
      [{ code: 'MIS', description: 'Misceláneo', parent: 'FER' }],
      [{ code: 'MIS', description: 'Misceláneo', parent: 'SOF' }],
      { parentAware: true },
    );
    expect(diffs[0]!.state).toBe('DATOS_DIFERENTES');
    const item = buildSyncPlanItem(diffs[0]!);
    expect(item.operation).toBe('BLOCKED');
    expect(item.safe).toBe(false);
  });

  it('resumen y ejecutabilidad del plan', () => {
    const items = [
      buildSyncPlanItem({ catalog: 'U', code: 'A', standardValue: 'a', destValue: 'a', state: 'IGUAL' }),
      buildSyncPlanItem({ catalog: 'U', code: 'B', standardValue: 'b', destValue: null, state: 'FALTA_EN_DESTINO' }),
      buildSyncPlanItem({ catalog: 'U', code: 'C', standardValue: 'c', destValue: 'x', state: 'DESCRIPCION_DIFERENTE' }),
      buildSyncPlanItem({ catalog: 'U', code: 'D', standardValue: 'd', destValue: 'y', state: 'DATOS_DIFERENTES' }),
    ];
    const s = summarizePlan(items);
    expect(s).toMatchObject({ iguales: 1, faltantes: 1, descripcionesDiferentes: 1, bloqueados: 1, total: 4 });
    expect(isPlanExecutable(items)).toBe(false);
    expect(isPlanExecutable(items.slice(0, 3))).toBe(true);
  });
});

describe('FASE 17 — preflight global y verificación', () => {
  it('todas OK → ok; una falla → cero escrituras (evaluador)', () => {
    const ok = (company: string) => ({ company, ok: true, checks: [{ key: 'CONNECTION' as const, ok: true, detail: '' }] });
    const bad = { company: 'COR_A3', ok: true, checks: [{ key: 'TRIGGER_COMPAT' as const, ok: false, detail: 'difiere' }] };
    expect(evaluateGlobalPreflight([ok('AD_TRANS'), ok('AD_DIST')]).ok).toBe(true);
    expect(evaluateGlobalPreflight([ok('AD_TRANS'), ok('AD_DIST'), bad]).ok).toBe(false);
  });

  it('verificación compara valores, no solo existencia', () => {
    const expected = { co_art: 'FERMIS0664', art_des: 'TORNILLO', co_us_in: 'DM', dis_cen: '' };
    expect(compareArticlePayload(null, expected)).toEqual(['NOT_FOUND']);
    expect(compareArticlePayload({ ...expected }, expected)).toEqual([]);
    expect(compareArticlePayload({ ...expected, art_des: 'OTRO' }, expected)).toEqual(['art_des']);
  });
});

// ---------------------------------------------------------------------------
// Fixture en memoria con semántica transaccional real (commit/rollback).
// ---------------------------------------------------------------------------

interface MemCatRow { code: string; description: string; parent?: string }
interface MemDb {
  catalogs: Record<string, MemCatRow[]>;
  art: Array<Record<string, string>>;
  triggers: string[];
  trigDef: string;
  accounts: string[];
}

const ART_COLS = ['co_art', 'art_des', 'tipo', 'co_lin', 'co_subl', 'uni_venta', 'suni_venta', 'tipo_imp', 'co_cat', 'co_color', 'procedenci', 'co_prov', 'tipo_cos', 'dis_cen', 'co_us_in', 'fecha_reg', 'stock_act'];

function baseCatalogs(): Record<string, MemCatRow[]> {
  return {
    tabulado: [{ code: '1', description: 'IVA' }],
    unidades: [{ code: 'UND', description: 'UNIDAD' }],
    lin_art: [{ code: 'FER', description: 'Ferretería' }],
    sub_lin: [{ code: 'MIS', description: 'Misceláneo', parent: 'FER' }],
    cat_art: [{ code: '01', description: 'GENERAL' }],
    colores: [{ code: '01', description: 'NO APLICA' }],
    prov: [{ code: 'GEN', description: 'GENÉRICO' }],
    proceden: [{ code: '01', description: 'NACIONAL' }],
  };
}

function memDb(over: Partial<MemDb> = {}): MemDb {
  return {
    catalogs: baseCatalogs(),
    art: [],
    triggers: ['TrigI_art', 'TrigU_art', 'TrigD_art', 'TrigD_artMce'],
    trigDef: 'CREATE TRIGGER TrigI_art STD',
    accounts: [],
    ...over,
  };
}

const COL_META: Record<string, Array<{ n: string; nullable: string; def: string | null }>> = {
  tabulado: [
    { n: 'tipo', nullable: 'NO', def: null }, { n: 'descripcio', nullable: 'NO', def: null },
  ],
  unidades: [
    { n: 'co_uni', nullable: 'NO', def: null }, { n: 'des_uni', nullable: 'NO', def: null }, { n: 'co_us_in', nullable: 'YES', def: null },
  ],
  lin_art: [
    { n: 'co_lin', nullable: 'NO', def: null }, { n: 'lin_des', nullable: 'NO', def: null }, { n: 'co_us_in', nullable: 'YES', def: null },
  ],
  sub_lin: [
    { n: 'co_subl', nullable: 'NO', def: null }, { n: 'subl_des', nullable: 'NO', def: null }, { n: 'co_lin', nullable: 'NO', def: null }, { n: 'co_us_in', nullable: 'YES', def: null },
  ],
  cat_art: [
    { n: 'co_cat', nullable: 'NO', def: null }, { n: 'cat_des', nullable: 'NO', def: null }, { n: 'co_us_in', nullable: 'YES', def: null },
  ],
  colores: [
    { n: 'co_col', nullable: 'NO', def: null }, { n: 'des_col', nullable: 'NO', def: null }, { n: 'co_us_in', nullable: 'YES', def: null },
  ],
  prov: [
    { n: 'co_prov', nullable: 'NO', def: null }, { n: 'prov_des', nullable: 'NO', def: null }, { n: 'co_us_in', nullable: 'YES', def: null },
    { n: 'rif', nullable: 'NO', def: null },
  ],
  proceden: [
    { n: 'cod_proc', nullable: 'NO', def: null }, { n: 'des_proc', nullable: 'NO', def: null }, { n: 'co_us_in', nullable: 'YES', def: null },
  ],
};

interface Harness {
  svc: CorporateHomologationService;
  txCalls: () => number;
  committed: () => Record<string, MemDb>;
  audits: () => Array<{ action: string }>;
}

function tableOf(sql: string): { db: string; table: string } | null {
  const m = /\[([A-Z0-9_]+)\]\.dbo\.\[([a-z_]+)\]/i.exec(sql);
  return m ? { db: m[1]!.toUpperCase(), table: m[2]!.toLowerCase() } : null;
}

/** Base aludida en consultas a INFORMATION_SCHEMA/sys/OBJECT_ID (sin [tabla]). */
function dbOf(sql: string): string {
  const m1 = /\[([A-Z0-9_]+)\]\.(?:dbo|INFORMATION_SCHEMA|sys)\b/i.exec(sql);
  if (m1) return m1[1]!.toUpperCase();
  const m2 = /'\[([A-Z0-9_]+)\]/i.exec(sql);
  return (m2?.[1] ?? '').toUpperCase();
}

function makeHarness(opts: {
  dbs: Record<string, MemDb>;
  listed?: string[];
  writesEnabled?: boolean;
  tamperVerifyFor?: string;
} = { dbs: {} }): Harness {
  let state: Record<string, MemDb> = structuredClone(opts.dbs);
  let txCount = 0;
  const auditLog: Array<{ action: string }> = [];
  const writesEnabled = opts.writesEnabled ?? true;
  const listed = opts.listed ?? [...Object.keys(opts.dbs), 'AD_GRUP'];

  const codeOf = (rows: MemCatRow[], code: string): MemCatRow | undefined =>
    rows.find((r) => r.code.trim().toUpperCase() === code.trim().toUpperCase());

  async function selectOn(model: Record<string, MemDb>, sql: string, params: Record<string, { value: any }>): Promise<any[]> {
    const pv = (n: string): string => String(params[n]?.value ?? '').trim();
    if (/TEmpresas/.test(sql)) {
      return listed.filter((c) => c !== 'AD_GRUP').map((c) => ({ cod_emp: c, nombre: c, rif: 'J0' }));
    }
    if (/DB_ID/.test(sql)) {
      return model[pv('db')] ? [{ id: 7 }] : [{ id: null }];
    }
    if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql) && /TABLE_NAME = 'art'/.test(sql)) {
      return ART_COLS.map((c) => ({ c }));
    }
    if (/sys\.key_constraints/.test(sql)) return [{ one: 1 }];
    if (/INFORMATION_SCHEMA\.TABLES/.test(sql)) {
      const db = dbOf(sql);
      const tables = [...Object.keys(model[db]?.catalogs ?? {}), 'art'];
      return tables.map((t) => ({ t }));
    }
    if (/INFORMATION_SCHEMA\.COLUMNS/.test(sql)) {
      const t = pv('t').toLowerCase();
      return (COL_META[t] ?? []).map((c) => ({ ...c }));
    }
    if (/sys\.triggers/.test(sql)) {
      const db = dbOf(sql);
      return (model[db]?.triggers ?? []).map((n) => ({ n }));
    }
    if (/OBJECT_DEFINITION/.test(sql)) {
      const m = /\[([A-Z0-9_]+)\]\.dbo\.\[(\w+)\]/i.exec(sql);
      const db = (m?.[1] ?? '').toUpperCase();
      return [{ def: model[db]?.trigDef ?? null }];
    }
    if (/MAX\(RIGHT/.test(sql)) {
      const ref = tableOf(sql)!;
      const prefix = pv('pfx');
      let max = 0;
      for (const row of model[ref.db]?.art ?? []) {
        const co = (row['co_art'] ?? '').trim();
        if (co.startsWith(prefix)) {
          const tail = co.slice(prefix.length);
          if (/^\d{1,4}$/.test(tail)) max = Math.max(max, parseInt(tail, 10));
        }
      }
      return [{ m: max > 0 ? String(max).padStart(4, '0') : null }];
    }
    if (/sccuenta/.test(sql)) {
      const hit = Object.values(model).some((db) => db.accounts.includes(pv('c')));
      return hit ? [{ one: 1 }] : [];
    }
    // SELECT de catálogo completo (ORDER BY 1) vs existencia (WHERE).
    const ref = tableOf(sql);
    if (ref && /ORDER BY 1/.test(sql)) {
      return (model[ref.db]?.catalogs[ref.table] ?? []).map((r) => ({
        code: r.code, description: r.description, parent: r.parent,
      }));
    }
    if (ref && /SELECT 1 AS one/.test(sql)) {
      if (ref.table === 'art') {
        const hit = (model[ref.db]?.art ?? []).some((r) => (r['co_art'] ?? '').trim() === pv('c'));
        return hit ? [{ one: 1 }] : [];
      }
      const hit = codeOf(model[ref.db]?.catalogs[ref.table] ?? [], pv('c'));
      return hit ? [{ one: 1 }] : [];
    }
    if (ref && /SELECT TOP 1/.test(sql) && ref.table === 'art') {
      const row = (model[ref.db]?.art ?? []).find((r) => (r['co_art'] ?? '').trim() === pv('c'));
      if (!row) return [];
      const out = { ...row };
      if (opts.tamperVerifyFor === ref.db) out['art_des'] = 'MANIPULADO';
      return [out];
    }
    if (ref && /SELECT LTRIM\(RTRIM\(co_lin\)\) AS p FROM/.test(sql)) {
      const row = codeOf(model[ref.db]?.catalogs['sub_lin'] ?? [], pv('s'));
      return row?.parent ? [{ p: row.parent }] : [];
    }
    throw new Error(`SQL no soportado por el fixture: ${sql.slice(0, 80)}`);
  }

  const readFake = { rawQuery: (sql: string, params: any = {}) => selectOn(state, sql, params) };

  async function txExec(model: Record<string, MemDb>, sql: string, params: Record<string, { value: any }>): Promise<any[]> {
    const ref = tableOf(sql);
    if (/^INSERT INTO/i.test(sql) && ref) {
      if (ref.table === 'art') {
        const row: Record<string, string> = {};
        for (const [k, v] of Object.entries(params)) row[k] = String(v.value ?? '');
        row['co_art'] = row['co_art'] ?? '';
        model[ref.db]!.art.push({
          co_art: row['co_art'], art_des: row['art_des'] ?? '', tipo: row['tipo'] ?? '',
          co_lin: row['co_lin'] ?? '', co_subl: row['co_subl'] ?? '', uni_venta: row['uni_venta'] ?? '',
          suni_venta: row['suni_venta'] ?? '', tipo_imp: row['tipo_imp'] ?? '', co_cat: row['co_cat'] ?? '',
          co_color: row['co_color'] ?? '', procedenci: row['procedenci'] ?? '', co_prov: row['co_prov'] ?? '',
          tipo_cos: row['tipo_cos'] ?? '', dis_cen: row['dis_cen'] ?? '', co_us_in: row['co_us_in'] ?? '',
        });
        return [];
      }
      // NOT NULL sin default más allá de lo cubierto → falla como Profit real.
      model[ref.db]!.catalogs[ref.table]!.push({
        code: String(params['c0']?.value ?? ''),
        description: String(params['c1']?.value ?? ''),
        parent: params['c2'] !== undefined ? String(params['c2'].value ?? '') : undefined,
      });
      // Simula prov.rif NOT NULL sin default: falla como lo haría Profit.
      if (ref.table === 'prov') throw new Error('50000: columna rif exige dato manual');
      return [];
    }
    if (/^UPDATE/i.test(sql) && ref) {
      const row = codeOf(model[ref.db]!.catalogs[ref.table]!, String(params['c0']?.value ?? ''));
      if (row) row.description = String(params['c1']?.value ?? '');
      return [];
    }
    return selectOn(model, sql, params);
  }

  const writeFake = {
    hasInsertPermission: async () => writesEnabled,
    runInGlobalTransaction: async (work: (q: any) => Promise<any>) => {
      if (!writesEnabled) throw new Error('Profit write disabled by feature flag (PROFIT_WRITE_ENABLED=false)');
      txCount++;
      const clone: Record<string, MemDb> = structuredClone(state);
      const q = (sql: string, params: any = {}) => txExec(clone, sql, params);
      try {
        const out = await work(q);
        state = clone; // COMMIT: todo o nada.
        return out;
      } catch (e) {
        throw e; // ROLLBACK: se descarta el clon.
      }
    },
  };

  const companiesFake = {
    listCompanies: async () => listed.filter((c) => c !== 'AD_GRUP').map((c) => ({ code: c, name: c, rif: 'J0', isStandard: c === 'AD_TRANS' })),
    isListed: async (c: string) => {
      const code = String(c ?? '').trim().toUpperCase();
      return listed.includes(code) ? { code, name: code, rif: 'J0', isStandard: code === 'AD_TRANS' } : null;
    },
  };
  const configFake = { get: (k: string) => (k === 'PROFIT_INTEGRATION_USER_CODE' ? 'DM' : undefined) };
  const prismaFake = { auditEvent: { create: vi.fn(async () => ({})) } };
  const svc = new CorporateHomologationService(readFake as any, writeFake as any, companiesFake as any, configFake as any, prismaFake as any);
  return { svc, txCalls: () => txCount, committed: () => state, audits: () => auditLog };
}

const ARTICLE = {
  description: 'TORNILLO HEX',
  articleType: 'C',
  groupCode: 'FER',
  subgroupCode: 'MIS',
  unitCode: 'UND',
  taxType: '1',
};

const CTX = { userId: 'u5', companyId: 'c1' };

function twoDbs(overDist: Partial<MemDb> = {}, overTrans: Partial<MemDb> = {}): Record<string, MemDb> {
  const trans = memDb({ art: [{ co_art: 'FERMIS0663', art_des: 'BASE', tipo: 'C', co_lin: 'FER', co_subl: 'MIS', uni_venta: 'UND', suni_venta: 'UND', tipo_imp: '1', co_cat: '01', co_color: '01', procedenci: '01', co_prov: 'GEN', tipo_cos: 'ULCO', dis_cen: '', co_us_in: 'DM' }], ...overTrans });
  const distCats = baseCatalogs();
  distCats['lin_art'] = [];
  const dist = memDb({ catalogs: distCats, ...overDist });
  return { AD_TRANS: trans, AD_DIST: dist };
}

describe('FASE 17 — homologate con transacción global', () => {
  it('crea faltantes y actualiza descripciones (commit)', async () => {
    const h = makeHarness({ dbs: twoDbs() });
    const r = await h.svc.homologate(['AD_DIST'], CTX);
    expect(r.ok).toBe(true);
    expect(r.inserts).toBe(1);
    expect(r.updates).toBe(0);
    expect(h.txCalls()).toBe(1);
    const dist = h.committed()['AD_DIST']!;
    expect(dist.catalogs['lin_art']).toEqual([{ code: 'FER', description: 'Ferretería', parent: undefined }]);
  });

  it('plan bloqueado → cero escrituras (sin transacción)', async () => {
    const dbs = twoDbs();
    dbs['AD_DIST']!.catalogs['sub_lin'] = [{ code: 'MIS', description: 'Misceláneo', parent: 'SOF' }];
    const h = makeHarness({ dbs });
    const r = await h.svc.homologate(['AD_DIST'], CTX);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('CORPORATE_PLAN_BLOCKED');
    expect(h.txCalls()).toBe(0);
  });

  it('trigger incompatible → preflight falla → cero escrituras', async () => {
    const dbs = twoDbs();
    dbs['AD_DIST']!.trigDef = 'CREATE TRIGGER TrigI_art OTRO';
    const h = makeHarness({ dbs });
    const p = await h.svc.preflight(['AD_DIST']);
    expect(p.ok).toBe(false);
    const r = await h.svc.homologate(['AD_DIST'], CTX);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('CORPORATE_PREFLIGHT_FAILED');
    expect(h.txCalls()).toBe(0);
  });

  it('flag deshabilitado → sin permiso → cero escrituras', async () => {
    const h = makeHarness({ dbs: twoDbs(), writesEnabled: false });
    const r = await h.svc.homologate(['AD_DIST'], CTX);
    expect(r.ok).toBe(false);
    expect(h.txCalls()).toBe(0);
  });

  it('catálogo no insertable (prov.rif) → preflight falla → cero escrituras', async () => {
    const dbs = twoDbs();
    dbs['AD_DIST']!.catalogs['prov'] = [];
    const h = makeHarness({ dbs });
    const r = await h.svc.homologate(['AD_DIST'], CTX);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('CORPORATE_PREFLIGHT_FAILED');
    expect(h.txCalls()).toBe(0);
    expect(h.committed()['AD_DIST']!.catalogs['prov']).toEqual([]);
  });
});

describe('FASE 17 — registro multiempresa del artículo', () => {
  it('mismo código, correlativo y payload en todas + verificación', async () => {
    const h = makeHarness({ dbs: twoDbs() });
    const r = await h.svc.registerArticle(['AD_DIST'], ARTICLE, CTX);
    expect(r.ok).toBe(true);
    expect(r.coArt).toBe('FERMIS0664');
    expect(r.companies).toEqual(['AD_TRANS', 'AD_DIST']);
    for (const db of ['AD_TRANS', 'AD_DIST']) {
      const rows = h.committed()[db]!.art.filter((a) => a['co_art'] === 'FERMIS0664');
      expect(rows.length).toBe(1);
      expect(rows[0]).toMatchObject({ art_des: 'TORNILLO HEX', co_lin: 'FER', co_subl: 'MIS', co_us_in: 'DM', co_prov: 'GEN' });
    }
    // Dependencia homologada dentro de la misma transacción.
    expect(h.committed()['AD_DIST']!.catalogs['lin_art'].length).toBe(1);
    expect(r.perCompanyVerify.every((v) => v.verified)).toBe(true);
  });

  it('candidato ocupado en un destino → preflight falla → cero escrituras', async () => {
    const dbs = twoDbs();
    dbs['AD_DIST']!.art.push({ co_art: 'FERMIS0664', art_des: 'AJENO', tipo: 'C', co_lin: 'FER', co_subl: 'MIS', uni_venta: 'UND', suni_venta: 'UND', tipo_imp: '1', co_cat: '01', co_color: '01', procedenci: '01', co_prov: 'GEN', tipo_cos: 'ULCO', dis_cen: '', co_us_in: 'OT' });
    const h = makeHarness({ dbs });
    const r = await h.svc.registerArticle(['AD_DIST'], ARTICLE, CTX);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('CORPORATE_PREFLIGHT_FAILED');
    expect(h.txCalls()).toBe(0);
    expect(h.committed()['AD_TRANS']!.art.length).toBe(1);
  });

  it('fallo de verificación dentro de la TX → rollback total', async () => {
    const h = makeHarness({ dbs: twoDbs(), tamperVerifyFor: 'AD_DIST' });
    const r = await h.svc.registerArticle(['AD_DIST'], ARTICLE, CTX);
    expect(r.ok).toBe(false);
    expect(r.rolledBack).toBe(true);
    // Nada persistido en ninguna empresa: ni artículos ni catálogos.
    expect(h.committed()['AD_TRANS']!.art.length).toBe(1);
    expect(h.committed()['AD_DIST']!.art.length).toBe(0);
    expect(h.committed()['AD_DIST']!.catalogs['lin_art']).toEqual([]);
  });

  it('cuenta de dis_cen inexistente → preflight falla → cero escrituras', async () => {
    const h = makeHarness({ dbs: twoDbs() });
    const r = await h.svc.registerArticle(['AD_DIST'], { ...ARTICLE, disCen: '<DIS>{c1:9.9.9}</DIS>' }, CTX);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('CORPORATE_PREFLIGHT_FAILED');
    expect(h.txCalls()).toBe(0);
  });

  it('empresa fuera del catálogo corporativo → preflight falla', async () => {
    const h = makeHarness({ dbs: twoDbs(), listed: ['AD_TRANS', 'AD_DIST'] });
    const p = await h.svc.preflight(['AD_FANTASMA'], { article: ARTICLE });
    expect(p.ok).toBe(false);
  });

  it('tres empresas: una falla → cero escrituras en todas', async () => {
    const dbs = twoDbs();
    dbs['COR_A3'] = memDb();
    // COR_A3 difiere en TrigI_art: no es homologable automáticamente → bloquea todo.
    dbs['COR_A3']!.trigDef = 'CREATE TRIGGER TrigI_art OTRO_TEXTO';
    const h = makeHarness({ dbs, listed: ['AD_TRANS', 'AD_DIST', 'COR_A3'] });
    const r = await h.svc.registerArticle(['AD_DIST', 'COR_A3'], ARTICLE, CTX);
    expect(r.ok).toBe(false);
    expect(h.txCalls()).toBe(0);
    expect(h.committed()['AD_DIST']!.art.length).toBe(0);
    expect(h.committed()['AD_TRANS']!.art.length).toBe(1);
  });
});
