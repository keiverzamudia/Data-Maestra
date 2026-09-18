import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoricalUniverseService } from '../src/modulos/matching/application/historical-universe.service';
import { assessCoverage, buildFingerprint } from '../src/modulos/matching/domain/historical-coverage';

interface MemProfile {
  companyCode: string;
  profitArticleCode: string;
  originalDescription: string;
  normalizedDescription: string;
  normalizationVersion: string;
  tokensJson?: string | null;
  featuresJson?: string | null;
  origin?: string | null;
  coverage?: string | null;
  fingerprint?: string | null;
  brand?: string | null;
  model?: string | null;
  partNumber?: string | null;
  category?: string | null;
  subCategory?: string | null;
  unit?: string | null;
  application?: string | null;
}

function buildHarness(opts: {
  articles?: Record<string, Array<Record<string, string>>>;
  listed?: string[];
  brands?: string[];
} = {}) {
  const store = new Map<string, MemProfile>();
  const audit: any[] = [];
  const queries: string[] = [];
  const key = (c: string, p: string) => `${c}:${p}`;
  const matches = (row: MemProfile, where: any): boolean => {
    if (!where || Object.keys(where).length === 0) return true;
    for (const [k, v] of Object.entries(where)) {
      if (k === 'AND') {
        if (!(v as any[]).every((c) => matches(row, c))) return false;
      } else if (k === 'OR') {
        if (!(v as any[]).some((c) => matches(row, c))) return false;
      } else if (k === 'NOT') {
        if ((v as any[]).some((c) => matches(row, c))) return false;
      } else if (v !== null && typeof v === 'object' && 'not' in (v as any)) {
        if (matches(row, { [k]: (v as any).not })) return false;
      } else if (v !== null && typeof v === 'object' && 'contains' in (v as any)) {
        if (!String((row as any)[k] ?? '').toLowerCase().includes(String((v as any).contains).toLowerCase())) return false;
      } else if (((row as any)[k] ?? null) !== ((v as any) ?? null)) {
        return false;
      }
    }
    return true;
  };
  const prisma: any = {
    brand: { findMany: vi.fn(async () => (opts.brands ?? []).map((normalizedName) => ({ normalizedName }))) },
    articleNormalizationProfile: {
      findMany: vi.fn(async (args: any = {}) => {
        let rows = [...store.values()].filter((r) => matches(r, args.where ?? {}));
        rows = [...rows].sort((a, b) => (a.companyCode + a.profitArticleCode < b.companyCode + b.profitArticleCode ? -1 : 1));
        const skip = args.skip ?? 0;
        const take = args.take ?? rows.length;
        return rows.slice(skip, skip + take);
      }),
      count: vi.fn(async (args: any = {}) => {
        const rows: any[] = await prisma.articleNormalizationProfile.findMany({ where: args.where ?? {} });
        return rows.length;
      }),
      groupBy: vi.fn(async (args: any) => {
        const rows: any[] = await prisma.articleNormalizationProfile.findMany({});
        const by = args.by[0] as string;
        const map = new Map<string, number>();
        for (const r of rows) {
          const k = (r as any)[by] ?? 'SIN_EVALUAR';
          map.set(k, (map.get(k) ?? 0) + 1);
        }
        return [...map.entries()].map(([k, count]) => ({ [by]: k === 'SIN_EVALUAR' ? null : k, _count: count }));
      }),
    },
    requestData: { findMany: vi.fn(async () => [{ profitCode: 'DM0001' }]) },
    requestArticleLink: {
      findMany: vi.fn(async () => [{ requestId: 'r1', companyCode: 'AD_TRANS', profitArticleCode: 'A1', decision: 'SAME' }]),
    },
  };
  const repository: any = {
    findProfile: vi.fn(async (c: string, p: string) => store.get(key(c, p)) ?? null),
    upsertProfile: vi.fn(async (d: any) => {
      const row = { ...(store.get(key(d.companyCode, d.profitArticleCode)) ?? {}), ...d };
      store.set(key(d.companyCode, d.profitArticleCode), row);
      return row;
    }),
    findDecision: vi.fn(),
    createDecision: vi.fn(),
    listProfiles: vi.fn(async () => [...store.values()]),
    findDecisionsInvolving: vi.fn(async () => []),
  };
  const profitAdapter: any = {
    rawQuery: vi.fn(async (sql: string, params: any = {}) => {
      queries.push(sql);
      if (!sql.trimStart().toUpperCase().startsWith('SELECT')) {
        throw new Error(`Solo lectura permitida en tests: ${sql.slice(0, 60)}`);
      }
      const m = /FROM \[([A-Z0-9_]+)\]\.dbo\.art/i.exec(sql);
      const db = m ? m[1] : '';
      const all = opts.articles?.[db!] ?? [];
      const skip = params.skip?.value ?? 0;
      const take = params.take?.value ?? 200;
      return all.slice(skip, skip + take);
    }),
  };
  const listed = opts.listed ?? ['AD_TRANS', 'AD_DIST'];
  const companies: any = {
    listCompanies: vi.fn(async () => listed.map((code) => ({ code }))),
    isListed: vi.fn(async (code: string) => (listed.includes(code) ? { code } : null)),
  };
  const auditoria: any = { logEvent: vi.fn(async (e: any) => { audit.push(e); return e; }) };
  const service = new HistoricalUniverseService(prisma, profitAdapter, companies, repository, auditoria);
  return { service, store, audit, queries, profitAdapter };
}

const ART = (over: Record<string, string> = {}) => ({
  co_art: 'A1',
  art_des: 'Filtro de aceite DT466',
  co_lin: 'FER',
  co_subl: 'MIS',
  co_cat: '01',
  co_color: '01',
  uni_venta: 'UND',
  ...over,
});

describe('cobertura (pura, calidad ≠ similitud)', () => {
  it('INSUFICIENTE sin descripción utilizable', () => {
    expect(assessCoverage({ normalizedDescription: '', tokens: [], technicalTokens: [] })).toBe('INSUFICIENTE');
    expect(assessCoverage({ normalizedDescription: 'AB', tokens: ['AB'], technicalTokens: [] })).toBe('INSUFICIENTE');
  });

  it('BASICA con palabras pero sin señales', () => {
    expect(
      assessCoverage({ normalizedDescription: 'TORNILLO HEXAGONAL', tokens: ['TORNILLO', 'HEXAGONAL'], technicalTokens: [] }),
    ).toBe('BASICA');
  });

  it('COMPARABLE con técnicos o un atributo', () => {
    expect(
      assessCoverage({ normalizedDescription: 'FILTRO DT466', tokens: ['FILTRO', 'DT466'], technicalTokens: ['DT466'] }),
    ).toBe('COMPARABLE');
  });

  it('RICA con técnicos + 2 atributos', () => {
    expect(
      assessCoverage({
        normalizedDescription: 'FILTRO DT466', tokens: ['FILTRO', 'DT466'], technicalTokens: ['DT466'],
        brand: 'X', model: 'DT466',
      }),
    ).toBe('RICA');
  });
});

describe('fingerprint (preselección, no identidad)', () => {
  it('determinístico e independiente del orden', () => {
    const a = buildFingerprint({ technicalTokens: ['DT466', 'LF9009'], model: 'DT466', partNumber: 'LF9009' });
    const b = buildFingerprint({ technicalTokens: ['LF9009', 'DT466'], model: 'DT466', partNumber: 'LF9009' });
    expect(a).toBe(b);
    expect(a).toContain('DT466');
  });

  it('distinto contenido → distinto fingerprint', () => {
    expect(buildFingerprint({ technicalTokens: ['DT466'] })).not.toBe(buildFingerprint({ technicalTokens: ['DT530'] }));
  });
});

describe('ingesta histórica', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('1+3+4: artículo válido con v2, original preservado', async () => {
    const { service, store } = buildHarness({ articles: { AD_TRANS: [ART()] } });
    const r = await service.ingestCompany('AD_TRANS', { batchSize: 50, maxBatches: 1 });
    expect(r).toMatchObject({ companyCode: 'AD_TRANS', processed: 1, created: 1, updated: 0, skipped: 0 });
    const p = store.get('AD_TRANS:A1')!;
    expect(p.originalDescription).toBe('Filtro de aceite DT466');
    expect(p.normalizedDescription).toBe('FILTRO DE ACEITE DT466');
    expect(p.normalizationVersion).toBe('v2');
    expect(p.origin).toBe('HISTORICO');
    expect(p.coverage).toBe('RICA');
  });

  it('2: sin descripción → INSUFICIENTE pero registrado', async () => {
    const { service, store } = buildHarness({ articles: { AD_TRANS: [ART({ co_art: 'B2', art_des: '  ' })] } });
    const r = await service.ingestCompany('AD_TRANS', { maxBatches: 1 });
    expect(r.created).toBe(1);
    expect(store.get('AD_TRANS:B2')!.coverage).toBe('INSUFICIENTE');
  });

  it('6+7: identidad companyCode+profitCode; compañías no colisionan', async () => {
    const { service, store } = buildHarness({
      articles: { AD_TRANS: [ART()], AD_DIST: [ART()] },
      listed: ['AD_TRANS', 'AD_DIST'],
    });
    await service.ingestCompany('AD_TRANS', { maxBatches: 1 });
    await service.ingestCompany('AD_DIST', { maxBatches: 1 });
    expect(store.size).toBe(2);
    expect(store.get('AD_TRANS:A1')!.origin).toBe('HISTORICO');
    expect(store.get('AD_DIST:A1')!.origin).toBe('HISTORICO');
  });

  it('14: segunda ejecución idempotente (todo skipped)', async () => {
    const { service } = buildHarness({ articles: { AD_TRANS: [ART()] } });
    await service.ingestCompany('AD_TRANS', { maxBatches: 1 });
    const r2 = await service.ingestCompany('AD_TRANS', { maxBatches: 1 });
    expect(r2).toMatchObject({ processed: 1, created: 0, updated: 0, skipped: 1 });
  });

  it('16: empresa no listada se rechaza (sin hardcode)', async () => {
    const { service } = buildHarness({ articles: {}, listed: ['AD_TRANS'] });
    await expect(service.ingestCompany('AD_XXX', { maxBatches: 1 })).rejects.toThrow();
  });

  it('formato inválido se rechaza antes de consultar', async () => {
    const { service, queries } = buildHarness({ articles: {} });
    await expect(service.ingestCompany('AD-TRANS!', { maxBatches: 1 })).rejects.toThrow();
    expect(queries).toHaveLength(0);
  });

  it('17: lotes acotados (sin migración masiva)', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ART({ co_art: `A${i}` }));
    const { service, profitAdapter } = buildHarness({ articles: { AD_TRANS: rows } });
    const r = await service.ingestCompany('AD_TRANS', { batchSize: 10000, maxBatches: 100 });
    expect(r.processed).toBe(10);
    const takes = profitAdapter.rawQuery.mock.calls.map((c: any[]) => c[1].take.value);
    for (const t of takes) expect(t).toBeLessThanOrEqual(500);
    expect(r.batches).toBeLessThanOrEqual(20);
  });

  it('15: solo SELECT contra Profit', async () => {
    const { service, queries } = buildHarness({ articles: { AD_TRANS: [ART()] } });
    await service.ingestCompany('AD_TRANS', { maxBatches: 1 });
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q.trimStart().toUpperCase().startsWith('SELECT')).toBe(true);
      expect(q).not.toMatch(/INSERT|UPDATE|DELETE/i);
    }
  });
});

describe('métricas y consulta', () => {
  it('8+9: métricas con distribución y relaciones DM', async () => {
    const { service } = buildHarness({ articles: { AD_TRANS: [ART(), ART({ co_art: 'B2', art_des: '' })] } });
    await service.ingestCompany('AD_TRANS', { maxBatches: 1 });
    const m = await service.getMetrics();
    expect(m.total).toBe(2);
    expect(m.perCompany).toEqual([{ companyCode: 'AD_TRANS', count: 2 }]);
    expect(m.withDescription).toBe(1);
    expect(m.withoutDescription).toBe(1);
    expect(m.coverage.find((c) => c.level === 'RICA')?.count).toBe(1);
    expect(m.coverage.find((c) => c.level === 'INSUFICIENTE')?.count).toBe(1);
    expect(m.dmCreatedByCode).toEqual(['DM0001']);
    expect(m.linked).toHaveLength(1);
    expect(m.companiesDiscovered).toEqual(['AD_TRANS', 'AD_DIST']);
  });

  it('10+11: paginación y filtros básicos', async () => {
    const { service } = buildHarness({
      articles: { AD_TRANS: [ART(), ART({ co_art: 'B2', art_des: '' }), ART({ co_art: 'C3', art_des: 'Tornillo', uni_venta: '' })] },
    });
    await service.ingestCompany('AD_TRANS', { maxBatches: 1 });
    const p1 = await service.listHistorical({}, 1, 2);
    expect(p1).toMatchObject({ total: 3, page: 1, limit: 2 });
    expect(p1.items).toHaveLength(2);
    const p2 = await service.listHistorical({}, 2, 2);
    expect(p2.items).toHaveLength(1);
    expect((await service.listHistorical({ companyCode: 'AD_DIST' }, 1, 25)).total).toBe(0);
    expect((await service.listHistorical({ code: 'B2' }, 1, 25)).total).toBe(1);
    expect((await service.listHistorical({ text: 'tornillo' }, 1, 25)).total).toBe(1);
    expect((await service.listHistorical({ coverage: 'RICA' }, 1, 25)).total).toBe(1);
    // B2 no tiene descripción pero sí unidad estructural → también técnico.
    expect((await service.listHistorical({ hasTechnical: true }, 1, 25)).total).toBe(2);
  });

  it('12+13: técnica e insuficientes distinguibles', async () => {
    const { service } = buildHarness({
      articles: { AD_TRANS: [ART(), ART({ co_art: 'B2', art_des: 'x' })] },
    });
    await service.ingestCompany('AD_TRANS', { maxBatches: 1 });
    expect((await service.listHistorical({ hasTechnical: false }, 1, 25)).total).toBe(2);
    expect((await service.listHistorical({ coverage: 'INSUFICIENTE' }, 1, 25)).total).toBe(1);
  });
});
