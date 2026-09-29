import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogSyncService } from '../src/modulos/profit/catalog-sync.service';

/**
 * FASE 27 — MANEJO MULTIEMPRESA.
 * Cero escrituras reales en Profit: el adapter de escritura es un mock.
 */

const MASTER = [
  { catalogKey: 'lin_art', code: '01', description: 'FLETES', parentCode: null },
  { catalogKey: 'lin_art', code: 'COM', description: 'COMBUSTIBLE', parentCode: null },
  { catalogKey: 'lin_art', code: 'FER', description: 'FERRETERIA', parentCode: null },
];

/** Contenido de cada catálogo por empresa. */
const DEST: Record<string, Record<string, Array<{ code: string; description: string; parent?: string }>>> = {
  AD_DIST: {
    lin_art: [
      { code: '01', description: 'COMBUSTIBLE' },   // mismo código, otro significado
      { code: 'COM', description: 'COMBUSTIBLES' }, // mismo código, otro significado
      { code: 'FER', description: 'FERRETERIA' },   // igual
    ],
    sub_lin: [],
    cat_art: [],
    colores: [],
    unidades: [],
    tabulado: [],
    prov: [],
    proceden: [],
  },
  AD_ROMA: {
    lin_art: [], // no tiene líneas: todo falta
    sub_lin: [],
    cat_art: [],
    colores: [],
    unidades: [],
    tabulado: [],
    prov: [],
    proceden: [],
  },
};

function harness(opts: { company?: string } = {}) {
  const company = opts.company ?? 'AD_DIST';
  const proposals: any[] = [];
  const links: any[] = [];
  const audit: any[] = [];
  const inserts: Array<{ db: string; code: string; desc: string }> = [];

  const prisma: any = {
    masterCatalogEntry: {
      count: vi.fn(async () => MASTER.length),
      findMany: vi.fn(async () => MASTER.map((m) => ({ ...m, active: true }))),
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
    },
    companyCatalogCode: {
      findMany: vi.fn(async () => links.filter((l) => l.active !== false)),
      findFirst: vi.fn(async () => null),
      upsert: vi.fn(async ({ create, update }: any) => { links.push({ ...(create ?? update), active: true }); return {}; }),
    },
    companyCatalogProposal: {
      count: vi.fn(async () => proposals.filter((p) => p.status === 'PENDING').length),
      findUnique: vi.fn(async ({ where }: any) => proposals.find((p) => p.id === where.id) ?? null),
      findFirst: vi.fn(async ({ where }: any) =>
        proposals.find((p) => p.status === 'PENDING' && p.catalogKey === where.catalogKey
          && p.companyCode === where.companyCode && p.masterCode === where.masterCode) ?? null),
      create: vi.fn(async ({ data }: any) => { proposals.push({ id: `p${proposals.length + 1}`, status: 'PENDING', createdAt: new Date(), decidedAt: null, decidedBy: null, ...data }); return {}; }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = proposals.find((p) => p.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      findMany: vi.fn(async () => proposals),
      groupBy: vi.fn(async () => []),
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
    isWriteEnabled: () => true,
    runInGlobalTransaction: vi.fn(async (work: any) => {
      const tx = vi.fn(async (sql: string, bound: Record<string, any>) => {
        const db = /\[([A-Z0-9_]+)\]\.dbo/.exec(sql)?.[1] ?? '?';
        inserts.push({ db, code: String(bound['c0']?.value ?? ''), desc: String(bound['c1']?.value ?? '') });
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

  return { service, prisma, proposals, links, audit, inserts, readAdapter, company };
}

describe('Manejo Multiempresa — detección de conflictos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mismo código con otra descripción → CONFLICTO y propone COM1 sin tocar la fila existente', async () => {
    const { service } = harness();
    const r = await service.analyze('u1');
    const dist = r.companies.find((c) => c.company === 'AD_DIST')!;
    const com = dist.lines.find((l) => l.masterCode === 'COM' && l.catalogKey === 'lin_art')!;
    expect(com.state).toBe('CONFLICTO');
    expect(com.proposedCode).toBe('COM1');
    expect(com.localExistingCode).toBe('COM');
    expect(com.localExistingDescription).toBe('COMBUSTIBLES');

    // El 01 de AD_TRANS (FLETES) choca con 01 = COMBUSTIBLE de AD_DIST.
    const fletes = dist.lines.find((l) => l.masterCode === '01' && l.catalogKey === 'lin_art')!;
    expect(fletes.state).toBe('CONFLICTO');
    expect(fletes.localExistingCode).toBe('01');
    expect(fletes.localExistingDescription).toBe('COMBUSTIBLE');
    expect(fletes.proposedCode).toBe('011');
    expect(fletes.detail).toContain('sin tocar la fila existente');

    // FER coincide → IGUAL, sin propuesta.
    expect(dist.lines.find((l) => l.masterCode === 'FER')!.state).toBe('IGUAL');
  });

  it('catálogo vacío en destino → FALTA con el código del maestro', async () => {
    const { service, proposals } = harness();
    const r = await service.analyze('u1');
    const roma = r.companies.find((c) => c.company === 'AD_ROMA')!;
    const fer = roma.lines.find((l) => l.masterCode === 'FER' && l.catalogKey === 'lin_art')!;
    expect(fer.state).toBe('FALTA');
    expect(fer.proposedCode).toBe('FER');
    expect(proposals.filter((p) => p.companyCode === 'AD_ROMA' && p.reason === 'FALTA').length).toBeGreaterThan(0);
  });

  it('el análisis es idempotente: no duplica propuestas abiertas', async () => {
    const { service, proposals } = harness();
    await service.analyze('u1');
    const first = proposals.length;
    await service.analyze('u1');
    expect(proposals.length).toBe(first);
  });

  it('exige sincronizar el maestro antes de analizar', async () => {
    const { service, prisma } = harness();
    prisma.masterCatalogEntry.count.mockResolvedValueOnce(0);
    await expect(service.analyze('u1')).rejects.toThrow('Sincronice primero');
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
    expect(inserts).toEqual([{ db: 'AD_DIST', code: 'COM1', desc: 'COMBUSTIBLE' }]);
    expect(links).toEqual([
      expect.objectContaining({ catalogKey: 'lin_art', companyCode: 'AD_DIST', masterCode: 'COM', localCode: 'COM1', origin: 'LOCAL_NEW' }),
    ]);
    expect(audit.some((a) => a.action === 'MULTIEMPRESA_CATALOG_CONFIRMED')).toBe(true);
  });

  it('rechazar no escribe nada en Profit', async () => {
    const { service, proposals, links, inserts, audit } = harness();
    await service.analyze('u1');
    const p = proposals.find((x) => x.companyCode === 'AD_DIST' && x.masterCode === 'COM')!;
    const view = await service.reject(p.id, 'u9', 'ya tiene su equivalente');
    expect(view.status).toBe('REJECTED');
    expect(inserts).toEqual([]);
    expect(links).toEqual([]);
    expect(audit.some((a) => a.action === 'MULTIEMPRESA_CATALOG_REJECTED')).toBe(true);
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
    expect(out.subgroupCode).toBe('MIS'); // sin vínculo → igual
    expect(out.unitCode).toBe('UND');
    expect(out.taxType).toBe('1');
    expect(out.colorCode).toBe('01');
  });
});
