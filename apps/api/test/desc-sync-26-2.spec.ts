import { describe, it, expect, vi } from 'vitest';
import { buildSyncPlanItem, summarizePlan, isPlanExecutable } from '../src/modulos/profit/corporate-compare';
import { CORPORATE_CATALOGS } from '../src/modulos/profit/corporate-catalogs';
import { CorporateHomologationService } from '../src/modulos/profit/corporate-homologation.service';
import { MultiCompanyService } from '../src/modulos/profit/multi-company.service';

// ---------------------------------------------------------------------------
// FASE 26.2 — Interruptor "Las descripciones de AD_TRANS mandan".
// Sin el flag: fail-closed (BLOCKED), idéntico a la Fase 17/26.
// Con el flag: UPDATE_DESCRIPTION seguro, con razón explícita y auditada.
// ---------------------------------------------------------------------------

const DIFF_LOCAL: any = {
  catalog: 'Líneas', code: '01', parent: undefined,
  standardValue: 'FLETES', destValue: 'COMBUSTIBLE', state: 'DESCRIPCION_DIFERENTE',
};

describe('FASE 26.2 — buildSyncPlanItem con allowDescSync', () => {
  it('sin flag: BLOCKED (comportamiento Fase 17 intacto)', () => {
    const item = buildSyncPlanItem(DIFF_LOCAL, CORPORATE_CATALOGS['lin_art']);
    expect(item.operation).toBe('BLOCKED');
    expect(item.safe).toBe(false);
    expect(isPlanExecutable([item])).toBe(false);
  });

  it('con flag: UPDATE_DESCRIPTION seguro y con razón explícita', () => {
    const item = buildSyncPlanItem(DIFF_LOCAL, CORPORATE_CATALOGS['lin_art'], { allowDescSync: true });
    expect(item.operation).toBe('UPDATE_DESCRIPTION');
    expect(item.safe).toBe(true);
    expect(item.reason).toContain('AD_TRANS');
    expect(isPlanExecutable([item])).toBe(true);
  });

  it('el flag no cambia los catálogos globales (ya eran seguros)', () => {
    const diff = { ...DIFF_LOCAL, catalog: 'Unidades', standardValue: 'KILOGRAMOS', destValue: 'KILOS' };
    const withFlag = buildSyncPlanItem(diff, CORPORATE_CATALOGS['unidades'], { allowDescSync: true });
    const without = buildSyncPlanItem(diff, CORPORATE_CATALOGS['unidades']);
    expect(withFlag.operation).toBe('UPDATE_DESCRIPTION');
    expect(without.operation).toBe('UPDATE_DESCRIPTION');
  });

  it('el resumen lo cuenta como descripción a actualizar', () => {
    const items = [
      buildSyncPlanItem(DIFF_LOCAL, CORPORATE_CATALOGS['lin_art'], { allowDescSync: true }),
      buildSyncPlanItem(DIFF_LOCAL, CORPORATE_CATALOGS['lin_art']),
    ];
    const s = summarizePlan(items);
    expect(s.descripcionesDiferentes).toBe(1);
    expect(s.bloqueados).toBe(1);
  });
});

describe('FASE 26.2 — compare() respeta el flag por empresa', () => {
  function harness(configs: Array<{ code: string; allowDescSync: boolean }>) {
    const readFake: any = {
      rawQuery: vi.fn(async (sql: string) => {
        if (/TEmpresas/.test(sql)) {
          return [
            { cod_emp: 'AD_TRANS', nombre: 'T', rif: 'J1' },
            { cod_emp: 'AD_DIST', nombre: 'D', rif: 'J2' },
          ];
        }
        const m = /\[(AD_[A-Z0-9_]+)\]\.dbo\.\[([a-z_]+)\]/i.exec(sql);
        if (m && /ORDER BY 1/.test(sql)) {
          const db = m[1]!.toUpperCase();
          const table = m[2]!.toLowerCase();
          if (table === 'lin_art') {
            return db === 'AD_TRANS'
              ? [{ code: '01', description: 'FLETES' }]
              : [{ code: '01', description: 'COMBUSTIBLE' }];
          }
          return [];
        }
        return [];
      }),
    };
    const writeFake: any = { hasInsertPermission: async () => true, runInGlobalTransaction: async (work: any) => work(async () => []) };
    const companiesFake: any = {
      listCompanies: async () => [
        { code: 'AD_TRANS', name: 'T', rif: 'J1', isStandard: true },
        { code: 'AD_DIST', name: 'D', rif: 'J2', isStandard: false },
      ],
      isListed: async (c: string) => ({ code: c, name: c, rif: 'J', isStandard: c === 'AD_TRANS' }),
    };
    const configFake: any = { get: () => undefined };
    const prismaFake: any = {
      auditEvent: { create: vi.fn(async () => ({})) },
      profitCompanyConfig: {
        findMany: vi.fn(async () => configs.map((c) => ({ enabled: true, isStandard: false, ...c }))),
      },
    };
    const svc = new CorporateHomologationService(readFake, writeFake, companiesFake, configFake, prismaFake);
    return { svc, prismaFake };
  }

  it('empresa SIN autorización → bloqueado y plan no ejecutable', async () => {
    const { svc } = harness([{ code: 'AD_DIST', allowDescSync: false }]);
    const r = await svc.compare(['AD_DIST']);
    const lin = r.companies[0]!.items.find((i: any) => i.catalog === 'Líneas')!;
    expect(lin.operation).toBe('BLOCKED');
    expect(r.executable).toBe(false);
  });

  it('empresa CON autorización → actualización y plan ejecutable', async () => {
    const { svc } = harness([{ code: 'AD_DIST', allowDescSync: true }]);
    const r = await svc.compare(['AD_DIST']);
    const lin = r.companies[0]!.items.find((i: any) => i.catalog === 'Líneas')!;
    expect(lin.operation).toBe('UPDATE_DESCRIPTION');
    expect(lin.reason).toContain('AD_TRANS');
    expect(r.executable).toBe(true);
  });
});

describe('FASE 26.2 — saveCompanyConfig persiste el flag', () => {
  function build(allowDescSync?: boolean) {
    const audit: any[] = [];
    const store: any[] = [];
    const prisma: any = {
      profitCompanyConfig: {
        findMany: vi.fn(async () => store.map((c) => ({ ...c }))),
        findUnique: vi.fn(async ({ where }: any) => store.find((c) => c.code === where.code) ?? null),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const i = store.findIndex((c) => c.code === where.code);
          const row = { ...create, ...update, code: where.code };
          if (i >= 0) store[i] = row; else store.push(row);
          return row;
        }),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };
    const companies: any = {
      listCompanies: async () => [
        { code: 'AD_TRANS', name: 'T', rif: 'J1', isStandard: true },
        { code: 'AD_DIST', name: 'D', rif: 'J2', isStandard: false },
      ],
      isListed: async (code: string) => ({ code, name: code, rif: 'J', isStandard: code === 'AD_TRANS' }),
    };
    const readAdapter: any = { rawQuery: vi.fn(async () => []) };
    const writeAdapter: any = { isWriteEnabled: () => true, runInGlobalTransaction: async (work: any) => work(async () => []) };
    const homologation: any = { preflight: vi.fn(async () => ({ ok: true, companies: [] })) };
    const auditoria: any = { logEvent: vi.fn(async (e: any) => { audit.push(e); return e; }) };
    const config: any = { get: () => 'DM' };
    const svc = new MultiCompanyService(prisma, readAdapter, writeAdapter, companies, homologation, auditoria, config);
    return { svc, prisma, audit };
  }

  it('guarda allowDescSync=true y lo devuelve en listCompanies', async () => {
    const { svc, prisma } = build();
    await svc.saveCompanyConfig('AD_DIST', true, 'u1', true);
    expect(prisma.profitCompanyConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ code: 'AD_DIST', allowDescSync: true }),
    }));
    const list = await svc.listCompanies();
    expect(list.find((c: any) => c.code === 'AD_DIST')!.allowDescSync).toBe(true);
  });

  it('sin allowDescSync en el body no resetea el valor existente', async () => {
    const { svc, prisma } = build();
    await svc.saveCompanyConfig('AD_DIST', false, 'u1');
    expect(prisma.profitCompanyConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.not.objectContaining({ allowDescSync: expect.anything() }),
    }));
  });

  it('audita el valor del flag', async () => {
    const { svc, audit } = build();
    await svc.saveCompanyConfig('AD_DIST', true, 'u1', true);
    expect(audit[0]!.afterData).toContain('allowDescSync');
  });
});
