import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HistoricalDuplicateService } from '../src/modulos/matching/application/historical-duplicate.service';
import { maximalCliques, groupIdFor } from '../src/modulos/matching/domain/duplicate-groups';
import { comparePair } from '../src/modulos/matching/domain/match-engine';
import { REQUIRE_PERMISSION_KEY } from '../src/modulos/autenticacion/require-permission.decorator';
import { HistoricalDuplicatesController } from '../src/modulos/matching/historical-duplicates.controller';

interface MemProfile {
  companyCode: string;
  profitArticleCode: string;
  originalDescription: string;
  normalizedDescription: string;
  tokensJson?: string | null;
  featuresJson?: string | null;
  brand?: string | null;
  model?: string | null;
  partNumber?: string | null;
  category?: string | null;
  subCategory?: string | null;
  unit?: string | null;
  application?: string | null;
  coverage?: string | null;
  fingerprint?: string | null;
}

const prof = (company: string, code: string, over: Partial<MemProfile> = {}): MemProfile => ({
  companyCode: company,
  profitArticleCode: code,
  originalDescription: over.originalDescription ?? 'Filtro aceite DT466',
  normalizedDescription: over.normalizedDescription ?? 'FILTRO ACEITE DT466',
  tokensJson: JSON.stringify(['FILTRO', 'ACEITE', 'DT466']),
  featuresJson: JSON.stringify({ technicalTokens: ['DT466'] }),
  brand: 'INTERNATIONAL',
  model: 'DT466',
  partNumber: 'LF9009',
  category: 'FER',
  subCategory: 'MIS',
  unit: 'UND',
  application: 'CAMION',
  coverage: 'RICA',
  fingerprint: 'DT466|LF9009',
  ...over,
});

function buildHarness(profiles: MemProfile[], decisions: string[] = []) {
  const relations = new Map<string, any>();
  const groups = new Map<string, any>();
  const members = new Map<string, any[]>();
  const audit: any[] = [];
  const matches = (row: any, where: any): boolean => {
    if (!where || Object.keys(where).length === 0) return true;
    for (const [k, v] of Object.entries(where)) {
      if (k === 'AND') {
        if (!(v as any[]).every((c) => matches(row, c))) return false;
      } else if (k === 'OR') {
        if (!(v as any[]).some((c) => matches(row, c))) return false;
      } else if (k === 'NOT') {
        if ((v as any[]).some((c) => matches(row, c))) return false;
      } else if (v !== null && typeof v === 'object' && 'contains' in (v as any)) {
        if (!String(row[k] ?? '').includes(String((v as any).contains))) return false;
      } else if ((row[k] ?? null) !== ((v as any) ?? null)) {
        return false;
      }
    }
    return true;
  };
  const prisma: any = {
    articleNormalizationProfile: {
      findMany: vi.fn(async (args: any = {}) => {
        const rows = profiles.filter((r) => matches(r, args.where ?? {}));
        rows.sort((a, b) => (`${a.companyCode}:${a.profitArticleCode}` < `${b.companyCode}:${b.profitArticleCode}` ? -1 : 1));
        const skip = args.skip ?? 0;
        return rows.slice(skip, args.take ? skip + args.take : undefined);
      }),
      count: vi.fn(async (args: any = {}) => profiles.filter((r) => matches(r, args.where ?? {})).length),
    },
    articleMatchDecision: {
      findMany: vi.fn(async () => decisions.map((pairKey) => ({ pairKey }))),
    },
    historicalMatchRelation: {
      upsert: vi.fn(async ({ where, create }: any) => {
        const row = { ...(relations.get(where.pairKey) ?? {}), ...create, status: 'PENDIENTE_REVISION' };
        relations.set(where.pairKey, row);
        return row;
      }),
      findMany: vi.fn(async (args: any = {}) => {
        let rows = [...relations.values()].filter((r) => matches(r, args.where ?? {}));
        const order = args.orderBy?.[0] ?? { score: 'desc' };
        const [field, dir] = Object.entries(order)[0] as [string, 'asc' | 'desc'];
        rows.sort((a, b) => (dir === 'desc' ? (b[field] > a[field] ? 1 : -1) : a[field] > b[field] ? 1 : -1));
        const skip = args.skip ?? 0;
        return rows.slice(skip, args.take ? skip + args.take : undefined);
      }),
      count: vi.fn(async (args: any = {}) => [...relations.values()].filter((r) => matches(r, args.where ?? {})).length),
      groupBy: vi.fn(async (args: any) => {
        const by = args.by[0] as string;
        const map = new Map<string, number>();
        for (const r of relations.values()) {
          const k = String((r as any)[by]);
          map.set(k, (map.get(k) ?? 0) + 1);
        }
        return [...map.entries()].map(([k, count]) => ({ [by]: k, _count: count }));
      }),
    },
    historicalMatchGroup: {
      upsert: vi.fn(async ({ where, create }: any) => {
        const row = { status: 'PENDIENTE_REVISION', ...(groups.get(where.id) ?? {}), ...create };
        groups.set(where.id, row);
        return row;
      }),
      findMany: vi.fn(async (args: any = {}) => {
        let rows = [...groups.values()].filter((r) => matches(r, args.where ?? {}));
        rows.sort((a, b) => b.memberCount - a.memberCount);
        const skip = args.skip ?? 0;
        return rows.slice(skip, args.take ? skip + args.take : undefined).map((g) => ({
          ...g,
          members: (members.get(g.id) ?? []).map((m) => ({ ...m })),
        }));
      }),
      count: vi.fn(async (args: any = {}) => [...groups.values()].filter((r) => matches(r, args.where ?? {})).length),
    },
    historicalMatchGroupMember: {
      deleteMany: vi.fn(async ({ where }: any) => {
        members.set(where.groupId, []);
        return { count: 0 };
      }),
      createMany: vi.fn(async ({ data }: any) => {
        members.set(data[0].groupId, data);
        return { count: data.length };
      }),
    },
    $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
  };
  const repository: any = {
    findRelation: vi.fn(async (k: string) => relations.get(k) ?? null),
    upsertRelation: (d: any) => prisma.historicalMatchRelation.upsert({ where: { pairKey: d.pairKey }, create: d, update: d }),
    findRelations: (a: any) => prisma.historicalMatchRelation.findMany(a),
    countRelations: (w: any) => prisma.historicalMatchRelation.count({ where: w }),
    upsertGroup: (d: any) => prisma.historicalMatchGroup.upsert({ where: { id: d.id }, create: d, update: d }),
    findGroupWithMembers: vi.fn(async (id: string) => (groups.has(id) ? { ...groups.get(id), members: members.get(id) ?? [] } : null)),
    replaceGroupMembers: (gid: string, ms: any[]) => prisma.$transaction([]).then(() => {
      members.set(gid, ms);
      return [];
    }),
    findGroups: (a: any) => prisma.historicalMatchGroup.findMany(a),
    countGroups: (w: any) => prisma.historicalMatchGroup.count({ where: w }),
  };
  const companies: any = {
    isListed: vi.fn(async (c: string) => ({ code: c })),
    listCompanies: vi.fn(async () => []),
  };
  const auditoria: any = { logEvent: vi.fn(async (e: any) => { audit.push(e); return e; }) };
  const service = new HistoricalDuplicateService(prisma, companies, repository, auditoria);
  return { service, relations, groups, members, audit, prisma };
}

describe('preselección por fingerprint (no N×N)', () => {
  it('1: fingerprint compartido genera candidatos; distinto no compara', async () => {
    const { service } = buildHarness([
      prof('AD_TRANS', 'A1'),
      prof('AD_TRANS', 'A2'),
      prof('AD_DIST', 'B1', {
        originalDescription: 'Tornillo hexagonal M8',
        normalizedDescription: 'TORNILLO HEXAGONAL M8',
        tokensJson: JSON.stringify(['TORNILLO', 'HEXAGONAL', 'M8']),
        featuresJson: JSON.stringify({ technicalTokens: ['M8'] }),
        brand: null, model: null, partNumber: null, category: 'TOR', unit: 'UND',
        fingerprint: 'M8',
      }),
    ]);
    const r = await service.detect({ maxSeeds: 10 });
    expect(r.pairsCompared).toBe(1);
    expect(r.relationsCreated).toBe(1);
  });

  it('2: fingerprint idéntico no significa SAME (solo candidatos)', async () => {
    const { service, relations } = buildHarness([prof('AD_TRANS', 'A1'), prof('AD_TRANS', 'A2')]);
    await service.detect({ maxSeeds: 10 });
    const rel = [...relations.values()][0];
    expect(rel.classification).not.toBe('SAME');
    expect(rel.status).toBe('PENDIENTE_REVISION');
  });
});

describe('motor y reglas reutilizadas', () => {
  it('3-6: evidencias, score, conflictos y ausencia≠conflicto del motor v1', async () => {
    const { service, relations } = buildHarness([
      prof('AD_TRANS', 'A1'),
      prof('AD_DIST', 'B1', { brand: null, model: null, partNumber: null, category: null, subCategory: null, unit: null, application: null }),
    ]);
    await service.detect({ maxSeeds: 10 });
    const rel = [...relations.values()][0];
    expect(rel.engineVersion).toBe('v1');
    expect(JSON.parse(rel.conflictsJson)).not.toContain('BRAND_CONFLICT');
    expect(rel.score).toBeGreaterThan(0);
  });

  it('7: ausencia de información no genera conflicto', async () => {
    const { service, relations } = buildHarness([
      prof('AD_TRANS', 'A1'),
      prof('AD_TRANS', 'A2', { brand: null, model: null, partNumber: null }),
    ]);
    await service.detect({ maxSeeds: 10 });
    const rel = [...relations.values()][0];
    expect(JSON.parse(rel.conflictsJson)).not.toContain('BRAND_CONFLICT');
    expect(JSON.parse(rel.conflictsJson)).not.toContain('MODEL_CONFLICT');
  });
});

describe('relaciones e idempotencia', () => {
  it('8-9: A/B una sola relación canónica', async () => {
    const { service, relations } = buildHarness([prof('AD_TRANS', 'A1'), prof('AD_DIST', 'B1')]);
    await service.detect({ maxSeeds: 10 });
    expect(relations.size).toBe(1);
    expect([...relations.keys()][0]).toBe('AD_DIST:B1|AD_TRANS:A1');
  });

  it('10+14+23: reejecución idempotente (update, sin duplicar)', async () => {
    const { service, relations } = buildHarness([prof('AD_TRANS', 'A1'), prof('AD_DIST', 'B1')]);
    const r1 = await service.detect({ maxSeeds: 10 });
    expect(r1.relationsCreated).toBe(1);
    const r2 = await service.detect({ maxSeeds: 10 });
    expect(r2.relationsCreated).toBe(0);
    expect(r2.relationsUpdated).toBe(1);
    expect(relations.size).toBe(1);
  });

  it('decisiones humanas previas se omiten', async () => {
    const { service } = buildHarness(
      [prof('AD_TRANS', 'A1'), prof('AD_DIST', 'B1')],
      ['AD_DIST:B1|AD_TRANS:A1'],
    );
    const r = await service.detect({ maxSeeds: 10 });
    expect(r.relationsSkippedDecided).toBe(1);
    expect(r.pairsCompared).toBe(0);
  });

  it('18: engineVersion persistida', async () => {
    const { service, relations } = buildHarness([prof('AD_TRANS', 'A1'), prof('AD_DIST', 'B1')]);
    await service.detect({ maxSeeds: 10 });
    expect([...relations.values()][0].engineVersion).toBe('v1');
  });
});

describe('multi-compañía y coverage', () => {
  it('11: mismo código en compañías distintas son registros distintos comparables', async () => {
    const { service, relations } = buildHarness([prof('AD_TRANS', 'X1'), prof('AD_DIST', 'X1')]);
    const r = await service.detect({ maxSeeds: 10 });
    expect(r.pairsCompared).toBe(1);
    expect([...relations.keys()][0]).toBe('AD_DIST:X1|AD_TRANS:X1');
  });

  it('12: mismo código, misma compañía y mismos datos no se auto-compara', async () => {
    const { service } = buildHarness([prof('AD_TRANS', 'X1')]);
    const r = await service.detect({ maxSeeds: 10 });
    expect(r.pairsCompared).toBe(0);
  });

  it('13-14: INSUFICIENTE se cuenta pero no entra a buckets', async () => {
    const { service } = buildHarness([
      prof('AD_TRANS', 'A1'),
      prof('AD_TRANS', 'B9', {
        originalDescription: '', normalizedDescription: '', tokensJson: '[]',
        featuresJson: '{}', brand: null, model: null, partNumber: null,
        category: null, subCategory: null, unit: null, application: null,
        coverage: 'INSUFICIENTE', fingerprint: '',
      }),
    ]);
    const r = await service.detect({ maxSeeds: 10 });
    expect(r.insufficientProfiles).toBe(1);
    expect(r.pairsCompared).toBe(0);
  });

  it('15: BASICA/RICA conservan coverage en la relación', async () => {
    const { service, relations } = buildHarness([
      prof('AD_TRANS', 'A1', { coverage: 'RICA' }),
      prof('AD_TRANS', 'A2', { coverage: 'COMPARABLE' }),
    ]);
    await service.detect({ maxSeeds: 10 });
    const rel = [...relations.values()][0];
    expect([rel.coverageA, rel.coverageB].sort()).toEqual(['COMPARABLE', 'RICA']);
  });
});

describe('grupos conservadores', () => {
  it('16: clique sin conflictos forma un grupo PENDIENTE_REVISION', async () => {
    const { service, groups, members } = buildHarness([
      prof('AD_TRANS', 'A1'), prof('AD_TRANS', 'A2'), prof('AD_DIST', 'B1'),
    ]);
    await service.detect({ maxSeeds: 10 });
    expect(groups.size).toBe(1);
    const g = [...groups.values()][0];
    expect(g.status).toBe('PENDIENTE_REVISION');
    expect(g.memberCount).toBe(3);
    expect(g.engineVersion).toBe('v1');
    expect(members.get(g.id)).toHaveLength(3);
    expect(JSON.parse(g.summaryJson).members).toHaveLength(3);
  });

  it('17: sin transitividad peligrosa (A↔B, B↔C, A↔C en conflicto)', async () => {
    const base = {
      originalDescription: 'FILTRO P1',
      normalizedDescription: 'FILTRO P1',
      tokensJson: JSON.stringify(['FILTRO', 'P1']),
      featuresJson: JSON.stringify({ technicalTokens: ['P1'] }),
      model: null, category: null, subCategory: null, unit: null, application: null,
      coverage: 'COMPARABLE', fingerprint: 'P1',
    };
    const { service, groups } = buildHarness([
      prof('AD_TRANS', 'A1', { ...base, brand: 'INT', partNumber: 'P1' }),
      prof('AD_TRANS', 'B1', { ...base, brand: null, partNumber: 'P1' }),
      prof('AD_DIST', 'C1', { ...base, brand: 'CUM', partNumber: 'P1' }),
    ]);
    await service.detect({ maxSeeds: 10 });
    const sizes = [...groups.values()].map((g) => g.memberCount).sort();
    expect(sizes).toEqual([2, 2]);
    expect([...groups.values()].every((g) => g.memberCount < 3)).toBe(true);
  });
});

describe('batch, paginación, filtros y RBAC', () => {
  it('19+22: cursor reanuda sin reprocesar desde cero', async () => {
    const { service } = buildHarness([prof('AD_TRANS', 'A1'), prof('AD_TRANS', 'A2')]);
    const r1 = await service.detect({ maxSeeds: 1 });
    expect(r1.seedsProcessed).toBe(1);
    expect(r1.nextCursor).toEqual({ companyCode: 'AD_TRANS', profitArticleCode: 'A1' });
    const r2 = await service.detect({
      maxSeeds: 10,
      cursorCompanyCode: r1.nextCursor!.companyCode,
      cursorProfitCode: r1.nextCursor!.profitArticleCode,
    });
    expect(r2.seedsProcessed).toBe(1);
  });

  it('20-21: paginación y filtros de relaciones', async () => {
    const { service } = buildHarness([prof('AD_TRANS', 'A1'), prof('AD_DIST', 'B1')]);
    await service.detect({ maxSeeds: 10 });
    const all = await service.listRelaciones({}, 1, 25, { by: 'score', dir: 'desc' });
    expect(all.total).toBe(1);
    expect((await service.listRelaciones({ companyCode: 'AD_DIST' }, 1, 25, { by: 'score', dir: 'desc' })).total).toBe(1);
    expect((await service.listRelaciones({ companyCode: 'ZZZ' }, 1, 25, { by: 'score', dir: 'desc' })).total).toBe(0);
    expect((await service.listRelaciones({ classification: 'HIGH' }, 1, 25, { by: 'score', dir: 'desc' })).total).toBe(1);
    const art = await service.getRelacionesDeArticulo('AD_TRANS', 'A1');
    expect(art.total).toBe(1);
  });

  it('25: endpoints exigen ADMIN.MANAGE', () => {
    const proto = HistoricalDuplicatesController.prototype;
    for (const m of ['resumen', 'relaciones', 'grupos', 'articulo', 'detectar'] as const) {
      const perms: string[] = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, proto[m]) ?? [];
      expect(perms).toEqual(['ADMIN.MANAGE']);
    }
  });
});

describe('dominio: cliques y grupos determinísticos', () => {
  it('maximalCliques es determinístico y ordenado', () => {
    const adj = new Map<string, Set<string>>([
      ['a', new Set(['b'])],
      ['b', new Set(['a', 'c'])],
      ['c', new Set(['b'])],
    ]);
    expect(maximalCliques(['a', 'b', 'c'], adj)).toEqual([['a', 'b'], ['b', 'c']]);
  });

  it('groupIdFor es estable e independiente del orden', () => {
    const m1 = [{ companyCode: 'AD_TRANS', profitArticleCode: 'A1' }, { companyCode: 'AD_DIST', profitArticleCode: 'B1' }];
    const m2 = [...m1].reverse();
    expect(groupIdFor(m1)).toBe(groupIdFor(m2));
    expect(groupIdFor(m1)).toMatch(/^grp:[0-9a-f]{32}$/);
  });
});
