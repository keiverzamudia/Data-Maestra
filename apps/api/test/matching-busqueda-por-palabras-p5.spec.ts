import { describe, it, expect, vi } from 'vitest';
import { MatchingService } from '../src/modulos/matching/application/matching.service';
import { MatchingRepository } from '../src/modulos/matching/infrastructure/matching.repository';
import { HistoricalUniverseService } from '../src/modulos/matching/application/historical-universe.service';
import { splitSearchTokens, tokenVariants, escapeLike, MAX_SEARCH_TOKENS } from '../src/modulos/matching/domain/search-tokens';

/**
 * FASE P5 — búsqueda POR PALABRAS (AND de tokens) en local y en Profit.
 *
 * Regresión real: la solicitud "SENSOR DE POSICIÓN HALL" no encontraba
 * `338-1488-CAT | SENSOR DE POSICIÓN DE EFECTO HALL` porque la búsqueda era
 * contención de frase completa y "EFECTO" interrumpe la frase. Devolvía 0 y
 * el usuario veía un falso negativo.
 *
 * Reglas a proteger:
 *  1) coinciden todos los tokens, en cualquier orden;
 *  2) local y Profit usan la MISMA tokenización (una sola fuente de verdad);
 *  3) el término del usuario nunca se concatena al SQL (solo parámetros);
 *  4) comodines LIKE escapados;
 *  5) el filtro por empresa sigue aplicándose.
 */

const AD_TRANS_PROFILE = {
  companyCode: 'AD_TRANS',
  profitArticleCode: '338-1488-CAT',
  originalDescription: 'SENSOR DE POSICIÓN DE EFECTO HALL',
  normalizedDescription: 'SENSOR DE POSICION DE EFECTO HALL',
  model: null,
};

const DECOY = {
  companyCode: 'AD_TRANS',
  profitArticleCode: 'RVHELE0270',
  originalDescription: 'SENSOR DE POSICION LEVA KX',
  normalizedDescription: 'SENSOR DE POSICION LEVA KX',
  model: null,
};

const OTRA_EMPRESA = {
  companyCode: 'AD_DIST',
  profitArticleCode: 'OTRA0001',
  originalDescription: 'SENSOR DE POSICIÓN DE EFECTO HALL',
  normalizedDescription: 'SENSOR DE POSICION DE EFECTO HALL',
  model: null,
};

/**
 * Evaluador mínimo del `where` de Prisma con semántica LIKE case-insensitive
 * (igual que SQLite/SQL Server): AND = todos, OR = alguno, hoja = contains.
 */
const matchesWhere = (row: any, where: any): boolean =>
  Object.entries(where).every(([key, cond]: [string, any]) => {
    if (key === 'AND') return cond.every((c: any) => matchesWhere(row, c));
    if (key === 'OR') return cond.some((c: any) => matchesWhere(row, c));
    if (cond && typeof cond === 'object' && 'contains' in cond) {
      return String(row[key] ?? '').toUpperCase().includes(String(cond.contains).toUpperCase());
    }
    return row[key] === cond;
  });

function fakePrisma(rows: any[]) {
  return {
    articleNormalizationProfile: {
      findMany: vi.fn(async ({ where, take }: any) =>
        rows.filter((r) => matchesWhere(r, where)).slice(0, take ?? rows.length)),
    },
  } as any;
}

describe('splitSearchTokens — FASE P5', () => {
  it('parte por no-alfanuméricos y conserva la forma con y sin acentos', () => {
    expect(splitSearchTokens('sensor de posición hall')).toEqual([
      { raw: 'SENSOR', folded: 'SENSOR' },
      { raw: 'DE', folded: 'DE' },
      { raw: 'POSICIÓN', folded: 'POSICION' },
      { raw: 'HALL', folded: 'HALL' },
    ]);
  });

  it('separa los guiones de un código Profit', () => {
    expect(splitSearchTokens('338-1488-CAT').map((t) => t.raw)).toEqual(['338', '1488', 'CAT']);
  });

  it('descarta tokens de 1 carácter y repetidos', () => {
    expect(splitSearchTokens('A X sensor SENSOR').map((t) => t.raw)).toEqual(['SENSOR']);
  });

  it('acota a 8 tokens para que siga siendo una búsqueda dirigida', () => {
    const tokens = splitSearchTokens('uno dos tres cuatro cinco seis siete ocho nueve diez');
    expect(tokens).toHaveLength(MAX_SEARCH_TOKENS);
  });

  it('sin tokens utilizables devuelve [] (la llamante usa la frase completa)', () => {
    expect(splitSearchTokens('A B')).toEqual([]);
    expect(splitSearchTokens('   ')).toEqual([]);
  });

  it('tokenVariants no duplica cuando raw y folded coinciden', () => {
    expect(tokenVariants({ raw: 'HALL', folded: 'HALL' })).toEqual(['HALL']);
    expect(tokenVariants({ raw: 'POSICIÓN', folded: 'POSICION' })).toEqual(['POSICIÓN', 'POSICION']);
  });

  it('escapeLike neutraliza los comodines de SQL', () => {
    expect(escapeLike('100%_a[b]')).toBe('100[%][_]a[[]b[]]');
    // Los tokens son solo [A-Za-z0-9]: el comodín no puede llegar desde un
    // token, solo desde la frase completa del respaldo.
    expect(splitSearchTokens('100% seguro').every((t) => /^[\p{L}\p{N}]+$/u.test(t.raw))).toBe(true);
  });
});

describe('MatchingRepository.searchProfiles — por palabras (Fase P5)', () => {
  const repo = (rows: any[]) => new MatchingRepository(fakePrisma(rows));
  const rows = [AD_TRANS_PROFILE, DECOY, OTRA_EMPRESA];

  it('encuentra "SENSOR DE POSICIÓN HALL" dentro de "…DE EFECTO HALL"', async () => {
    const found = await repo(rows).searchProfiles('AD_TRANS', 'SENSOR DE POSICIÓN HALL', 20);
    expect(found.map((p: any) => p.profitArticleCode)).toEqual(['338-1488-CAT']);
  });

  it('funciona sin acentos (variante folded sobre normalizedDescription)', async () => {
    const found = await repo(rows).searchProfiles('AD_TRANS', 'sensor de posicion hall', 20);
    expect(found.map((p: any) => p.profitArticleCode)).toEqual(['338-1488-CAT']);
  });

  it('el orden de las palabras no importa', async () => {
    const found = await repo(rows).searchProfiles('AD_TRANS', 'hall sensor', 20);
    expect(found.map((p: any) => p.profitArticleCode)).toEqual(['338-1488-CAT']);
  });

  it('busca también por código Profit con guiones', async () => {
    const found = await repo(rows).searchProfiles('AD_TRANS', '338-1488-CAT', 20);
    expect(found.map((p: any) => p.profitArticleCode)).toEqual(['338-1488-CAT']);
  });

  it('exige TODOS los tokens: un artículo que no tiene "HALL" queda fuera', async () => {
    const found = await repo(rows).searchProfiles('AD_TRANS', 'sensor posicion hall', 20);
    expect(found.map((p: any) => p.profitArticleCode)).toEqual(['338-1488-CAT']);
  });

  it('sigue acotando por empresa', async () => {
    const found = await repo(rows).searchProfiles('AD_DIST', 'sensor hall', 20);
    expect(found.map((p: any) => p.profitArticleCode)).toEqual(['OTRA0001']);
  });

  it('sin empresa o sin término no consulta', async () => {
    expect(await repo(rows).searchProfiles('', 'sensor', 20)).toEqual([]);
    expect(await repo(rows).searchProfiles('AD_TRANS', '   ', 20)).toEqual([]);
  });
});

describe('HistoricalUniverseService.searchArticles — SQL por palabras (Fase P5)', () => {
  function build() {
    const calls: Array<{ sql: string; params: Record<string, { value: any }> }> = [];
    const profitAdapter: any = {
      rawQuery: vi.fn(async (sql: string, params: any) => { calls.push({ sql, params }); return []; }),
    };
    const companies: any = { isListed: vi.fn(async (c: string) => ({ code: c })) };
    const service = new HistoricalUniverseService({} as any, profitAdapter, companies, {} as any, {} as any);
    // Driver innecesario: el SQL solo necesita los tipos de los parámetros.
    (service as any).typeLib = { Int: 'int', VarChar: (n: number) => `varchar(${n})` };
    return { service, calls, profitAdapter };
  }

  it('nunca concatena el término en el SQL: viaja como parámetro', async () => {
    const { service, calls } = build();
    await service.searchArticles('AD_TRANS', 'SENSOR DE POSICIÓN HALL', 20);
    const { sql, params } = calls[0]!;
    expect(sql).not.toContain('SENSOR');
    expect(sql).toContain('AND');
    expect(Object.values(params).some((p) => String(p.value).includes('SENSOR'))).toBe(true);
    expect(params.take!.value).toBe(20);
  });

  it('genera un grupo AND por token con sus variantes (con y sin acento)', async () => {
    const { service, calls } = build();
    await service.searchArticles('AD_TRANS', 'POSICIÓN', 10);
    const { sql, params } = calls[0]!;
    expect(sql).toMatch(/\(.*LIKE @t0_0.*LIKE @t0_1.*\)/s);
    expect(params.t0_0!.value).toBe('%POSICIÓN%');
    expect(params.t0_1!.value).toBe('%POSICION%');
    expect(sql).not.toContain(' AND '); // un solo token: sin agrupación extra
  });

  it('escapa los comodines LIKE cuando se usa la frase completa del respaldo', async () => {
    const { service, calls } = build();
    // "A B%" no produce tokens utilizables → se busca la frase literal.
    await service.searchArticles('AD_TRANS', 'A B%', 10);
    const values = Object.values(calls[0]!.params).map((p) => String(p.value));
    expect(values).toContain('%A B[%]%');
  });

  it('sin tokens utilizables vuelve a la frase completa parametrizada', async () => {
    const { service, calls } = build();
    await service.searchArticles('AD_TRANS', 'A B', 10);
    const { sql, params } = calls[0]!;
    expect(sql).toContain('@pattern');
    expect(params.pattern!.value).toBe('%A B%');
  });

  it('rechaza una empresa desconocida antes de tocar Profit', async () => {
    const { service, profitAdapter } = build();
    await expect(service.searchArticles('EMP-A', 'SENSOR', 10)).rejects.toThrow(/inválido/);
    expect(profitAdapter.rawQuery).not.toHaveBeenCalled();
  });
});

describe('searchManualArticle end-to-end — Fase P4 + P5', () => {
  function buildEndToEnd() {
    const audit: any[] = [];
    const prisma: any = {
      brand: { findMany: vi.fn(async () => []) },
      request: {
        findUnique: vi.fn(async () => ({
          id: 'req-9',
          status: 'PENDIENTE_ALMACEN',
          requestedDescription: 'SENSOR DE POSICIÓN HALL',
          purpose: 'Señalización',
          referencePhotoUri: null,
          // Empresa local con guion: obliga a resolver el universo (P4).
          company: { code: 'EMP-A' },
          requestData: {
            brandCode: null, manufacturer: null, partNumber: null,
            groupId: null, subgroupId: null, unitCode: null, application: null,
            profitCode: null,
          },
        })),
      },
    };
    const repository = new MatchingRepository(fakePrisma([AD_TRANS_PROFILE, DECOY]));
    const auditoria: any = { logEvent: vi.fn(async (e: any) => { audit.push(e); return e; }) };
    const universe: any = { searchArticles: vi.fn(async () => []) };
    const companies: any = { isListed: vi.fn(async (c: string) => (c === 'AD_TRANS' ? { code: c } : null)) };
    const config: any = { get: vi.fn((k: string) => (k === 'PROFIT_DB_DATABASE' ? 'AD_TRANS' : undefined)) };
    const service = new MatchingService(prisma, {} as any, companies, repository, auditoria, universe, config);
    return { service, universe, audit };
  }

  it('la búsqueda de la solicitud encuentra 338-1488-CAT sin tocar Profit', async () => {
    const { service, universe, audit } = buildEndToEnd();
    const r = await service.searchManualArticle('req-9', 'SENSOR DE POSICIÓN HALL');

    expect(r.source).toBe('LOCAL');
    expect(r.companyCode).toBe('AD_TRANS');
    expect(r.results.map((x) => x.profitArticleCode)).toEqual(['338-1488-CAT']);
    expect(r.results[0]!.description).toBe('SENSOR DE POSICIÓN DE EFECTO HALL');
    expect(universe.searchArticles).not.toHaveBeenCalled();

    const ev = [...audit].reverse().find((e) => e.action === 'MANUAL_ARTICLE_SEARCH');
    expect(JSON.parse(ev.afterData)).toMatchObject({ count: 1, universeSource: 'CONFIG_FALLBACK' });
  });
});
