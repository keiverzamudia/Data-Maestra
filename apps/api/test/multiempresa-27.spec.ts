import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogSyncService, DEFAULT_CATALOGS } from '../src/modulos/profit/catalog-sync.service';

/**
 * FASE 27 — MANEJO MULTIEMPRESA.
 * Cero escrituras reales en Profit: el adapter de escritura es un mock.
 */

const MASTER = [
  { catalogKey: 'lin_art', code: '01', description: 'FLETES', parentCode: null },
  { catalogKey: 'lin_art', code: 'COM', description: 'COMBUSTIBLE', parentCode: null },
  { catalogKey: 'lin_art', code: 'FER', description: 'FERRETERIA', parentCode: null },
  { catalogKey: 'unidades', code: 'UND', description: 'UNIDAD', parentCode: null },
  { catalogKey: 'prov', code: 'GEN', description: 'PROVEEDOR GENERICO', parentCode: null },
];

/** Contenido por empresa y catálogo. */
const DEST: Record<string, Record<string, Array<{ code: string; description: string; parent?: string }>>> = {
  AD_DIST: {
    lin_art: [
      { code: '01', description: 'COMBUSTIBLE' },   // mismo código, otro significado
      { code: 'COM', description: 'COMBUSTIBLES' }, // mismo código, otro significado
      { code: 'FER', description: 'FERRETERIA' },   // igual
    ],
    sub_lin: [],
    unidades: [],                                   // falta UND
    prov: [],
  },
  AD_ROMA: { lin_art: [], unidades: [], prov: [] },
};

function harness(opts: { writeEnabled?: boolean; extraMaster?: typeof MASTER } = {}) {
  const proposals: any[] = [];
  const links: any[] = [];
  const audit: any[] = [];
  const inserts: Array<{ db: string; code: string; desc: string; table: string }> = [];
  const masters = [...MASTER, ...(opts.extraMaster ?? [])];

  const prisma: any = {
    masterCatalogEntry: {
      count: vi.fn(async () => masters.length),
      findMany: vi.fn(async (a: any) => {
        const wanted: string[] | undefined = a?.where?.catalogKey?.in;
        return masters.filter((m) => !wanted || wanted.includes(m.catalogKey)).map((m) => ({ ...m, active: true }));
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        const k = where?.catalogKey_code ?? {};
        return masters.find((m) => m.catalogKey === k.catalogKey && String(m.code).toUpperCase() === String(k.code ?? '').toUpperCase()) ?? null;
      }),
      upsert: vi.fn(async () => ({})),
    },
    companyCatalogCode: {
      findMany: vi.fn(async () => links.filter((l) => l.active !== false)),
      findFirst: vi.fn(async ({ where }: any) => links.find(
        (l) => l.active !== false
          && (!where.catalogKey || l.catalogKey === where.catalogKey)
          && (!where.companyCode || l.companyCode === where.companyCode)
          && (!where.masterCode || String(l.masterCode).toUpperCase() === String(where.masterCode).toUpperCase()),
      ) ?? null),
      upsert: vi.fn(async ({ create, update }: any) => {
        links.push({ ...(create ?? update), active: true });
        return {};
      }),
    },
    companyCatalogProposal: {
      count: vi.fn(async (a: any) => proposals.filter((p) => p.status === (a?.where?.status ?? 'PENDING')).length),
      findUnique: vi.fn(async ({ where }: any) => proposals.find((p) => p.id === where.id) ?? null),
      findFirst: vi.fn(async ({ where }: any) => proposals.find(
        (p) => p.status === 'PENDING' && p.catalogKey === where.catalogKey
          && p.companyCode === where.companyCode && p.masterCode === where.masterCode,
      ) ?? null),
      create: vi.fn(async ({ data }: any) => {
        proposals.push({ id: `p${proposals.length + 1}`, status: 'PENDING', createdAt: new Date(), decidedAt: null, decidedBy: null, ...data });
        return {};
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = proposals.find((p) => p.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      findMany: vi.fn(async (a: any) => proposals.filter(
        (p) => (!a?.where?.companyCode || p.companyCode === a.where.companyCode)
          && (!a?.where?.catalogKey || p.catalogKey === a.where.catalogKey)
          && (!a?.where?.status || p.status === a.where.status),
      )),
      updateMany: vi.fn(async ({ where }: any) => {
        const keys: string[] = where.catalogKey?.in ?? [];
        const hit = proposals.filter(
          (p) => p.status === where.status && (!keys.length || keys.includes(p.catalogKey)),
        );
        for (const p of hit) Object.assign(p, { status: 'REJECTED', decidedAt: new Date(), decidedBy: 'u9' });
        return { count: hit.length };
      }),
      groupBy: vi.fn(async ({ by }: { by: string[] }) => {
        const keys = ['companyCode', 'catalogKey', 'reason'] as const;
        const map = new Map<string, any>();
        for (const p of proposals.filter((x) => x.status === 'PENDING')) {
          const k = keys.map((f) => p[f]).join('|');
          const cur = map.get(k) ?? Object.fromEntries(keys.map((f) => [f, p[f]]));
          cur._count = { _all: (cur._count?._all ?? 0) + 1 };
          map.set(k, cur);
        }
        void by;
        return [...map.values()];
      }),
    },
  };

  const readAdapter: any = {
    rawQuery: vi.fn(async (sql: string) => {
      const m = /\[([A-Z0-9_]+)\]\.dbo\.\[([a-z_]+)\]/.exec(sql);
      if (!m) return [];
      const [, db, table] = m;
      return (DEST[db]?.[table] ?? []).map((r) => ({ code: r.code, description: r.description, parent: r.parent }));
    }),
  };

  const writeAdapter: any = {
    isWriteEnabled: () => opts.writeEnabled ?? true,
    runInGlobalTransaction: vi.fn(async (work: any) => {
      const tx = vi.fn(async (sql: string, bound: Record<string, any>) => {
        const db = /\[([A-Z0-9_]+)\]\.dbo\.\[([a-z_]+)\]/.exec(sql);
        inserts.push({
          db: db?.[1] ?? '?',
          table: db?.[2] ?? '?',
          code: String(bound['c0']?.value ?? ''),
          desc: String(bound['c1']?.value ?? ''),
        });
        return [];
      });
      return work(tx);
    }),
  };

  const service = new CatalogSyncService(
    prisma,
    readAdapter,
    writeAdapter,
    { listCompanies: async () => [
      { code: 'AD_TRANS', name: 'TRANSPORTE', rif: '' },
      { code: 'AD_DIST', name: 'DISTRIBUIDORA', rif: '' },
      { code: 'AD_ROMA', name: 'ROMA', rif: '' },
    ] } as any,
    { logEvent: vi.fn(async (e: any) => { audit.push(e); return e; }) } as any,
    { get: (k: string) => (k === 'PROFIT_INTEGRATION_USER_CODE' ? 'DM' : undefined) } as any,
  );

  return { service, prisma, proposals, links, audit, inserts, readAdapter };
}

describe('Manejo Multiempresa — alcance y subdivisión', () => {
  beforeEach(() => vi.clearAllMocks());

  it('por defecto excluye proveedores y procedencias', async () => {
    const { service } = harness();
    const r = await service.analyze('u1');
    expect(r.catalogs).toEqual(DEFAULT_CATALOGS);
    expect(r.catalogs).not.toContain('prov');
    expect(r.catalogs).not.toContain('proceden');
  });

  it('pide explícitamente incluir proveedores', async () => {
    const { service } = harness();
    const r = await service.analyze('u1', { includeProviders: true });
    expect(r.catalogs).toContain('prov');
  });

  it('devuelve contadores por catálogo y NO una lista gigante', async () => {
    const { service } = harness();
    const r = await service.analyze('u1');
    const dist = r.companies.find((c) => c.company === 'AD_DIST')!;
    expect(dist.counts.iguales).toBe(1);   // solo FER
    expect(dist.counts.conflictos).toBe(2); // 01 y COM
    expect(dist.counts.faltantes).toBe(1);  // UND
    const lineas = dist.catalogs.find((c) => c.key === 'lin_art')!;
    expect(lineas.label).toBe('Líneas');
    expect(lineas.conflictos).toBe(2);
    // Los IGUALES no viajan en `lines`.
    expect(dist.lines.some((l) => l.masterCode === 'FER')).toBe(false);
  });

  it('filtra por empresa y por catálogo', async () => {
    const { service } = harness();
    const r = await service.analyze('u1', { company: 'AD_DIST', catalog: 'lin_art' });
    expect(r.companies.map((c) => c.company)).toEqual(['AD_DIST']);
    const keys = r.companies[0]!.catalogs.map((c) => c.key);
    expect(keys).toEqual(['lin_art']);
  });

  it('pagina los problemas (limit/offset)', async () => {
    const { service } = harness();
    const r = await service.analyze('u1', { company: 'AD_DIST', limit: 1, offset: 1 });
    const dist = r.companies.find((c) => c.company === 'AD_DIST')!;
    expect(dist.totalProblems).toBe(3);
    expect(dist.lines).toHaveLength(1);
    expect(dist.offset).toBe(1);
  });
});

describe('Manejo Multiempresa — conflictos', () => {
  it('mismo código con otra descripción → propone código nuevo y NO toca la fila existente', async () => {
    const { service, inserts } = harness();
    const r = await service.analyze('u1');
    const dist = r.companies.find((c) => c.company === 'AD_DIST')!;
    const com = dist.lines.find((l) => l.masterCode === 'COM')!;
    expect(com.state).toBe('CONFLICTO');
    expect(com.proposedCode).toBe('COM1');
    expect(com.localExistingCode).toBe('COM');
    const fletes = dist.lines.find((l) => l.masterCode === '01')!;
    expect(fletes.proposedCode).toBe('011');
    expect(fletes.detail).toContain('sin tocar la fila existente');
    // Analizar no escribe NADA en Profit por defecto.
    expect(inserts).toEqual([]);
  });
});

describe('Manejo Multiempresa — faltantes', () => {
  it('con autoCreate crea los que faltan y los marca como CREADO', async () => {
    const { service, inserts, links, proposals } = harness();
    const r = await service.analyze('u1', { autoCreate: true, company: 'AD_DIST' });
    const dist = r.companies.find((c) => c.company === 'AD_DIST')!;
    expect(r.autoCreated).toBe(1);
    expect(dist.counts.creados).toBe(1);
    expect(dist.lines.find((l) => l.masterCode === 'UND')!.state).toBe('CREADO');
    // Se creó SOLO el faltante, con el código del maestro. Ningún conflicto.
    expect(inserts).toEqual([{ db: 'AD_DIST', table: 'unidades', code: 'UND', desc: 'UNIDAD' }]);
    expect(links.some((l) => l.localCode === 'UND')).toBe(true);
    expect(proposals.filter((p) => p.reason === 'FALTA' && p.companyCode === 'AD_DIST')).toEqual([]);
    // El conflicto NO se crea solo: queda como propuesta.
    expect(proposals.filter((p) => p.reason === 'CONFLICTO').length).toBeGreaterThan(0);
  });

  it('sin autoCreate solo genera la propuesta de faltante', async () => {
    const { service, inserts, proposals } = harness();
    await service.analyze('u1');
    expect(inserts).toEqual([]);
    expect(proposals.filter((p) => p.reason === 'FALTA').length).toBeGreaterThan(0);
  });

  it('con escritura deshabilitada nunca auto-crea', async () => {
    const { service, inserts } = harness({ writeEnabled: false });
    const r = await service.analyze('u1', { autoCreate: true, company: 'AD_DIST' });
    expect(r.autoCreated).toBe(0);
    expect(inserts).toEqual([]);
  });
});

describe('Manejo Multiempresa — confirmación humana', () => {
  it('confirmar crea el elemento en Profit y registra el vínculo + auditoría', async () => {
    const { service, proposals, links, audit, inserts } = harness();
    await service.analyze('u1');
    const p = proposals.find((x) => x.companyCode === 'AD_DIST' && x.masterCode === 'COM')!;
    const view = await service.confirm(p.id, undefined, 'u9');

    expect(view.status).toBe('CONFIRMED');
    expect(view.localCode).toBe('COM1');
    expect(inserts).toEqual([{ db: 'AD_DIST', table: 'lin_art', code: 'COM1', desc: 'COMBUSTIBLE' }]);
    expect(links).toEqual([
      expect.objectContaining({ catalogKey: 'lin_art', companyCode: 'AD_DIST', masterCode: 'COM', localCode: 'COM1', origin: 'LOCAL_NEW' }),
    ]);
    expect(audit.some((a) => a.action === 'MULTIEMPRESA_CATALOG_CONFIRMED')).toBe(true);
  });

  it('confirmar en bloque acepta varias y reporta errores sin abortar', async () => {
    const { service, proposals, inserts } = harness();
    await service.analyze('u1');
    const pend = proposals.filter((p) => p.status === 'PENDING').map((p) => p.id);
    const r = await service.confirmBulk(pend, {}, 'u9');
    expect(r.confirmed).toBe(pend.length);
    expect(r.errors).toEqual([]);
    expect(inserts.length).toBe(pend.length);
  });

  it('acepta todas las de un catálogo, sin tocar otros', async () => {
    const { service, proposals } = harness();
    await service.analyze('u1');
    const r = await service.confirmAll('AD_DIST', 'lin_art', 'u9');
    expect(r.confirmed).toBe(2);
    expect(proposals.filter((p) => p.catalogKey === 'lin_art' && p.status === 'CONFIRMED')).toHaveLength(2);
  });

  it('descartar catálogos fuera de alcance solo marca REJECTED y no escribe en Profit', async () => {
    const { service, proposals, inserts, audit } = harness();
    // Provistas de un análisis previo con proveedores incluidos.
    proposals.push(
      { id: 'px1', status: 'PENDING', catalogKey: 'prov', companyCode: 'AD_DIST', masterCode: 'GEN', reason: 'FALTA', createdAt: new Date() },
      { id: 'px2', status: 'PENDING', catalogKey: 'proceden', companyCode: 'AD_DIST', masterCode: '01', reason: 'CONFLICTO', createdAt: new Date() },
      { id: 'px3', status: 'PENDING', catalogKey: 'lin_art', companyCode: 'AD_DIST', masterCode: 'COM', reason: 'CONFLICTO', createdAt: new Date() },
    );
    const r = await service.discardCatalogs(undefined, 'u9');
    expect(r.rejected).toBe(2);
    expect(r.catalogs).toEqual(['prov', 'proceden']);
    // El de líneas (el que sí importa) sigue PENDING.
    expect(proposals.find((p) => p.id === 'px3')!.status).toBe('PENDING');
    expect(proposals.filter((p) => p.status === 'REJECTED')).toHaveLength(2);
    // Nada se escribió en Profit.
    expect(inserts).toEqual([]);
    expect(audit.some((a) => a.action === 'MULTIEMPRESA_CATALOG_DISCARDED')).toBe(true);
  });

  it('sub_lin: el mismo código bajo otra línea NO bloquea (la identidad es el par)', async () => {
    const { service, proposals, inserts, links } = harness({
      extraMaster: [{ catalogKey: 'sub_lin', code: '02', description: 'PEAJE FACTURACION', parentCode: '02' }],
    });
    // Profit ya tiene la sublínea "02" colgada de la línea local "02";
    // el maestro la tiene colgada de la línea "02" (PEAJE FACTURACION), que en
    // esa empresa se resolvió como "021". El par (021, 02) está libre.
    proposals.push({
      id: 'psub', status: 'PENDING', catalogKey: 'sub_lin', companyCode: 'AD_DIST',
      masterCode: '02', masterDescription: 'PEAJE FACTURACION', localCode: '02',
      reason: 'CONFLICTO', detail: '', createdAt: new Date(),
    });
    links.push({ catalogKey: 'lin_art', companyCode: 'AD_DIST', masterCode: '02', localCode: '021', active: true });
    DEST.AD_DIST.sub_lin = [{ code: '02', description: 'FLETE', parent: '02' }];

    const view = await service.confirm('psub', undefined, 'u9');
    expect(view.status).toBe('CONFIRMED');
    // Se crea el par (021, 02) y NO se toca el FLETE existente.
    expect(inserts).toEqual([{ db: 'AD_DIST', table: 'sub_lin', code: '02', desc: 'PEAJE FACTURACION' }]);
  });

  it('sub_lin: si el par ya existe, se rechaza (no se duplica)', async () => {
    const { service, proposals, links, inserts } = harness({
      extraMaster: [{ catalogKey: 'sub_lin', code: '02', description: 'PEAJE FACTURACION', parentCode: '02' }],
    });
    proposals.push({
      id: 'psub2', status: 'PENDING', catalogKey: 'sub_lin', companyCode: 'AD_DIST',
      masterCode: '02', masterDescription: 'PEAJE FACTURACION', localCode: '02',
      reason: 'CONFLICTO', detail: '', createdAt: new Date(),
    });
    links.push({ catalogKey: 'lin_art', companyCode: 'AD_DIST', masterCode: '02', localCode: '021', active: true });
    DEST.AD_DIST.sub_lin = [{ code: '02', description: 'FLETE', parent: '021' }];

    await expect(service.confirm('psub2', undefined, 'u9')).rejects.toThrow('ya existe');
    expect(inserts).toEqual([]);
  });

  it('no se puede confirmar dos veces la misma propuesta', async () => {
    const { service, proposals } = harness();
    await service.analyze('u1');
    const p = proposals.find((x) => x.companyCode === 'AD_DIST' && x.masterCode === 'COM')!;
    await service.confirm(p.id, undefined, 'u9');
    await expect(service.confirm(p.id, undefined, 'u9')).rejects.toThrow('ya fue');
  });
});

describe('Manejo Multiempresa — resolución de códigos del artículo', () => {
  it('traduce solo los códigos con vínculo confirmado y deja el resto igual', async () => {
    const { service, links } = harness();
    links.push({ catalogKey: 'lin_art', companyCode: 'AD_DIST', masterCode: 'COM', localCode: 'COM1', active: true });
    const input = {
      description: 'X', articleType: 'C', groupCode: 'COM', subgroupCode: 'MIS',
      unitCode: 'UND', taxType: '1', colorCode: '01',
    };
    const out = await service.resolveArticleInput('AD_DIST', input);
    expect(out.groupCode).toBe('COM1');
    expect(out.subgroupCode).toBe('MIS');
    expect(out.unitCode).toBe('UND');
    expect(out.taxType).toBe('1');
    expect(out.colorCode).toBe('01');
  });
});
