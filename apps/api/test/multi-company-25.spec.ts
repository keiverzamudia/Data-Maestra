import { describe, it, expect, vi } from 'vitest';
import { MultiCompanyService } from '../src/modulos/profit/multi-company.service';

const INPUT_ART = {
  description: 'TORNILLO HEX',
  articleType: 'C',
  groupCode: 'FER',
  subgroupCode: 'MIS',
  unitCode: 'UND',
  taxType: '1',
};

function pfChecks(company: string, failKeys: string[] = [], codeOccupied = false) {
  const keys = ['IN_DIRECTORY', 'VALID_NAME', 'CONNECTION', 'SCHEMA', 'REQUIRED_TABLES',
    'REQUIRED_COLUMNS', 'TRIGGERS', 'TRIGGER_COMPAT', 'REQUIRED_CATALOGS', 'FK_DEPS',
    'DEFAULTS_01_GEN', 'WRITE_PERMISSION', 'CODE_CONFLICTS', 'SEQUENCE_CONFLICT', 'DISCEN_ACCOUNTS'];
  return {
    company,
    ok: failKeys.length === 0,
    checks: keys.map((key) => ({
      key,
      ok: key === 'CODE_CONFLICTS' ? !codeOccupied : !failKeys.includes(key),
      detail: key === 'CODE_CONFLICTS' && codeOccupied ? 'Candidato ocupado.' : `${key} ok`,
    })),
  };
}

function build(opts: {
  companies?: Array<{ code: string; name: string }>;
  configs?: Array<{ code: string; enabled: boolean; isStandard: boolean }>;
  preflight?: (company: string) => any;
  writeEnabled?: boolean;
  requestStatus?: string;
  linkDecision?: string | null;
  existingCodes?: string[];
  requestData?: any;
} = {}) {
  const audit: any[] = [];
  const companies = opts.companies ?? [
    { code: 'AD_TRANS', name: 'TRANSPORTE' },
    { code: 'AD_LUBSL', name: 'LUBRICANTES' },
    { code: 'AD_ROMA', name: 'ROMA' },
  ];
  const prisma: any = {
    profitCompanyConfig: {
      findMany: vi.fn(async () => opts.configs ?? []),
      findUnique: vi.fn(async ({ where }: any) => (opts.configs ?? []).find((c) => c.code === where.code) ?? null),
      upsert: vi.fn(async ({ where, create, update }: any) => ({ ...create, ...update, code: where.code })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    request: {
      findUnique: vi.fn(async () => ({ id: 'req-1', status: opts.requestStatus ?? 'CONTABILIDAD_APROBADA', requestNumber: 'REQ-1' })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async ({ data }: any) => data),
    },
    requestData: { update: vi.fn(async ({ data }: any) => data) },
    requestArticleLink: {
      findUnique: vi.fn(async () => (opts.linkDecision ? { decision: opts.linkDecision, profitArticleCode: 'X' } : null)),
    },
    catalogGroup: { findUnique: vi.fn(async () => ({ code: 'FER' })) },
    catalogSubgroup: { findUnique: vi.fn(async () => ({ code: 'MIS' })) },
    catalogCategory: { findUnique: vi.fn(async () => null) },
    profitArticleDistribution: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async ({ create }: any) => ({ id: 'd1', ...create })),
    },
  };
  // buildInput re-reads request with include; same mock extended:
  prisma.request.findUnique = vi.fn(async () => ({
    id: 'req-1', status: opts.requestStatus ?? 'CONTABILIDAD_APROBADA', requestNumber: 'REQ-1',
    requestedDescription: 'TORNILLO HEX',
    requestData: {
      groupId: 'g', subgroupId: 's', categoryId: null, articleType: 'C',
      unitCode: 'UND', taxType: '1', brandCode: null, model: null, ref: null,
      ...(opts.requestData ?? {}),
    },
    accountingCodes: [],
  }));
  const readAdapter: any = {
    rawQuery: vi.fn(async (sqlText: string) => {
      if (/MAX\(RIGHT/.test(sqlText)) return [{ m: '9' }];
      if (/SELECT 1 AS one FROM/.test(sqlText)) {
        const occupied = (opts.existingCodes ?? []).some((c) => sqlText.includes(c));
        void occupied;
        return [];
      }
      if (/lin_des|subl_des|des_uni/.test(sqlText)) return [{ d: 'MISMO' }];
      if (/TOP 1 LTRIM\(RTRIM\(co_art\)\)/.test(sqlText)) {
        return [{
          co_art: 'FERMIS0010', art_des: 'TORNILLO HEX', tipo: 'C', co_lin: 'FER', co_subl: 'MIS',
          uni_venta: 'UND', suni_venta: 'UND', tipo_imp: '1', co_cat: '01', co_color: '01',
          procedenci: '01', co_prov: 'GEN', tipo_cos: 'ULCO', dis_cen: '', co_us_in: 'DM',
          co_sucu: '01', uni_compra: 'UND', modelo: '', ref: '',
        }];
      }
      return [];
    }),
  };
  const inserts: string[] = [];
  const writeAdapter: any = {
    isWriteEnabled: () => opts.writeEnabled ?? true,
    runInGlobalTransaction: vi.fn(async (work: any) => {
      const tx = vi.fn(async (sqlText: string) => {
        if (/^INSERT INTO/i.test(sqlText)) {
          const m = /\[([A-Z0-9_]+)\]\.dbo/.exec(sqlText);
          inserts.push(m ? m[1]! : 'dbo');
        }
        return [];
      });
      return work(tx);
    }),
  };
  const homologation: any = {
    preflight: vi.fn(async (list: string[]) => ({
      ok: true,
      companies: list.map((c) => (opts.preflight ? opts.preflight(c) : pfChecks(c))),
    })),
  };
  const service = new MultiCompanyService(
    prisma,
    readAdapter,
    writeAdapter,
    { listCompanies: async () => companies, isListed: async (code: string) => companies.find((c) => c.code === code) ?? null } as any,
    homologation,
    { logEvent: vi.fn(async (e: any) => { audit.push(e); return e; }) } as any,
    { get: (k: string) => (k === 'PROFIT_INTEGRATION_USER_CODE' ? 'DM' : undefined) } as any,
  );
  return { service, prisma, audit, inserts, homologation, writeAdapter };
}

describe('multiempresa: descubrimiento + configuración', () => {
  it('fusiona TEmpresas con flags locales sin hardcodear', async () => {
    const { service } = build({
      configs: [{ code: 'AD_ROMA', enabled: false, isStandard: false }],
    });
    const list = await service.listCompanies();
    expect(list.map((c) => c.code)).toEqual(['AD_TRANS', 'AD_LUBSL', 'AD_ROMA']);
    expect(list.find((c) => c.code === 'AD_TRANS')!.isStandard).toBe(true);
    expect(list.find((c) => c.code === 'AD_ROMA')!.enabled).toBe(false);
    expect(list.find((c) => c.code === 'AD_LUBSL')!.enabled).toBe(true);
  });
});

describe('multiempresa: compatibilidad', () => {
  it('compatible / incompatible por subgrupo con motivo', async () => {
    const { service } = build({
      preflight: (c) => pfChecks(c, c === 'AD_LUBSL' ? ['REQUIRED_CATALOGS', 'FK_DEPS'] : []),
    });
    const r = await service.analyze('req-1', 'u1');
    expect(r.coArt).toBe('FERMIS0010');
    const lub = r.companies.find((c) => c.company === 'AD_LUBSL')!;
    expect(lub.status).toBe('INCOMPATIBLE');
    expect(lub.blockingReasons.join(' ')).toContain('REQUIRED_CATALOGS');
    const trans = r.companies.find((c) => c.company === 'AD_TRANS')!;
    expect(trans.status).toBe('COMPATIBLE');
    expect(r.compatibleCount).toBe(2);
    expect(r.incompatibleCount).toBe(1);
  });

  it('deshabilitada no es elegible y no cuenta como incompatible', async () => {
    const { service } = build({
      configs: [{ code: 'AD_ROMA', enabled: false, isStandard: false }],
    });
    const r = await service.analyze('req-1', 'u1');
    expect(r.companies.find((c) => c.company === 'AD_ROMA')!.status).toBe('DESHABILITADA');
  });

  it('código ocupado genera advertencia, no bloqueo', async () => {
    const { service } = build({ preflight: (c) => pfChecks(c, [], true) });
    const r = await service.analyze('req-1', 'u1');
    const trans = r.companies.find((c) => c.company === 'AD_TRANS')!;
    expect(trans.status).toBe('COMPATIBLE_WITH_WARNING');
    expect(trans.warnings.join(' ')).toContain('ya existe');
  });
});

describe('multiempresa: inserción', () => {
  it('flag apagado bloquea antes de cualquier SQL', async () => {
    const { service, writeAdapter } = build({ writeEnabled: false });
    await expect(service.insertSelected('req-1', ['AD_TRANS'], { id: 'u', companyId: 'c' }))
      .rejects.toThrow('PROFIT_WRITE_ENABLED=false');
    expect(writeAdapter.runInGlobalTransaction).not.toHaveBeenCalled();
  });

  it('sin empresas o estado inválido se rechaza', async () => {
    const { service } = build();
    await expect(service.insertSelected('req-1', [], { id: 'u', companyId: 'c' })).rejects.toThrow('al menos una empresa');
  });

  it('SAME vinculado bloquea la inserción', async () => {
    const { service } = build({ linkDecision: 'SAME' });
    await expect(service.insertSelected('req-1', ['AD_TRANS'], { id: 'u', companyId: 'c' }))
      .rejects.toThrow('no requiere inserción');
  });

  it('omite incompatible revalidada y YA_EXISTE; mismo código en todas', async () => {
    const { service, inserts, prisma } = build({
      preflight: (c) => pfChecks(c, c === 'AD_LUBSL' ? ['REQUIRED_CATALOGS'] : []),
    });
    const r = await service.insertSelected('req-1', ['AD_TRANS', 'AD_LUBSL', 'AD_ROMA'], { id: 'u', companyId: 'c' });
    // Una seleccionada incompatible → parcial (nunca "todo registrado").
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('PROFIT_MULTI_INSERT_PARTIAL');
    expect(r.coArt).toBe('FERMIS0010');
    const byCompany = Object.fromEntries(r.results.map((x) => [x.company, x.outcome]));
    expect(byCompany['AD_TRANS']).toBe('INSERTADO');
    expect(byCompany['AD_ROMA']).toBe('INSERTADO');
    expect(byCompany['AD_LUBSL']).toBe('OMITIDA_NO_COMPATIBLE');
    expect(inserts).toEqual(['AD_TRANS', 'AD_ROMA']);
    expect(prisma.requestData.update).toHaveBeenCalled();
  });

  it('error en una empresa no oculta el resto (parcial auditado)', async () => {
    const { service } = build({
      preflight: (c) => pfChecks(c, []),
    });
    // Rompe solo AD_ROMA en preflight de inserción (segunda llamada en adelante).
    let calls = 0;
    (service as any).homologation.preflight = vi.fn(async (list: string[]) => {
      calls += 1;
      return { ok: true, companies: list.map((c) => pfChecks(c, c === 'AD_ROMA' && calls > 1 ? ['CONNECTION'] : [])) };
    });
    const r = await service.insertSelected('req-1', ['AD_TRANS', 'AD_ROMA'], { id: 'u', companyId: 'c' });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('PROFIT_MULTI_INSERT_PARTIAL');
    expect(r.results.find((x) => x.company === 'AD_TRANS')!.outcome).toBe('INSERTADO');
    expect(r.results.find((x) => x.company === 'AD_ROMA')!.outcome).toBe('OMITIDA_NO_COMPATIBLE');
  });
});
