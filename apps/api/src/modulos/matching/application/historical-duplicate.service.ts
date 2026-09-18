import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../comun/prisma/prisma.service';
import { CorporateCompaniesService } from '../../profit/corporate-companies.service';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { comparePair } from '../domain/match-engine';
import type { ArticleMatchingInput } from '../domain/matching-contracts';
import type { ArticleSnapshot } from '../domain/match-engine';
import { pairKey } from '../domain/article-identity';
import { maximalCliques, groupIdFor } from '../domain/duplicate-groups';
import { MatchingRepository } from '../infrastructure/matching.repository';

export interface DetectOptions {
  companyCode?: string;
  batchSize?: number;
  maxSeeds?: number;
  maxBucketSize?: number;
  cursorCompanyCode?: string;
  cursorProfitCode?: string;
  actorId?: string;
}

export interface DetectProgress {
  seedsProcessed: number;
  pairsCompared: number;
  relationsCreated: number;
  relationsUpdated: number;
  relationsSkippedDecided: number;
  groupsCreated: number;
  groupsUpdated: number;
  bucketsTruncated: number;
  insufficientProfiles: number;
  elapsedMs: number;
  nextCursor: { companyCode: string; profitArticleCode: string } | null;
}

const MAX_UNIVERSE_ROWS = 20000;
const MAX_COMPONENT_NODES = 40;

type ProfileRow = {
  companyCode: string;
  profitArticleCode: string;
  originalDescription: string;
  normalizedDescription: string;
  tokensJson: string | null;
  featuresJson: string | null;
  brand: string | null;
  model: string | null;
  partNumber: string | null;
  category: string | null;
  subCategory: string | null;
  unit: string | null;
  application: string | null;
  coverage: string | null;
  fingerprint: string | null;
};

function technicalOf(p: ProfileRow): string[] {
  try {
    const parsed = JSON.parse(p.featuresJson ?? '{}') as { technicalTokens?: unknown };
    if (Array.isArray(parsed.technicalTokens)) {
      return parsed.technicalTokens.filter((t): t is string => typeof t === 'string' && t.trim() !== '');
    }
  } catch {
    // features corruptas: sin señales técnicas, sin inventar.
  }
  return [];
}

function snapshotOf(p: ProfileRow): ArticleSnapshot {
  return {
    article: { companyCode: p.companyCode, profitArticleCode: p.profitArticleCode },
    description: p.originalDescription,
    brand: p.brand ?? undefined,
    model: p.model ?? undefined,
    partNumber: p.partNumber ?? undefined,
    category: p.category ?? undefined,
    subCategory: p.subCategory ?? undefined,
    unit: p.unit ?? undefined,
    application: p.application ?? undefined,
  };
}

function inputOf(p: ProfileRow): ArticleMatchingInput {
  const s = snapshotOf(p);
  return {
    companyCode: s.article.companyCode,
    profitArticleCode: s.article.profitArticleCode,
    description: s.description,
    brand: s.brand,
    model: s.model,
    partNumber: s.partNumber,
    category: s.category,
    subCategory: s.subCategory,
    unit: s.unit,
    application: s.application,
  };
}

/**
 * FASE 23 — Detección histórica de posibles duplicados.
 * Solo lectura Profit (ya perfilado) + escritura local. Preselección por
 * fingerprints/tokens técnicos (jamás N×N global), comparación con el motor
 * v1 sin modificar, persistencia idempotente y grupos conservadores.
 * DETECCIÓN ≠ DECISIÓN.
 */
@Injectable()
export class HistoricalDuplicateService {
  private readonly logger = new Logger(HistoricalDuplicateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CorporateCompaniesService,
    private readonly repository: MatchingRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  async detect(opts: DetectOptions = {}): Promise<DetectProgress> {
    const started = Date.now();
    const batchSize = Math.max(1, Math.min(opts.batchSize ?? 200, 500));
    const maxSeeds = Math.max(1, Math.min(opts.maxSeeds ?? 200, 2000));
    const maxBucketSize = Math.max(2, Math.min(opts.maxBucketSize ?? 60, 200));
    let companyFilter: string | undefined;
    if (opts.companyCode) {
      companyFilter = String(opts.companyCode).trim().toUpperCase();
      if (!/^[A-Z0-9_]{1,30}$/.test(companyFilter)) {
        throw new BadRequestException(`Código de empresa inválido: "${opts.companyCode}".`);
      }
      const listed = await this.companies.isListed(companyFilter).catch(() => null);
      if (!listed) throw new BadRequestException(`Empresa no listada en TEmpresas: ${companyFilter}.`);
    }

    const profiles = (await this.prisma.articleNormalizationProfile.findMany({
      where: {
        ...(companyFilter ? { companyCode: companyFilter } : {}),
        NOT: [{ coverage: 'INSUFICIENTE' }],
      },
      orderBy: [{ companyCode: 'asc' }, { profitArticleCode: 'asc' }],
      take: MAX_UNIVERSE_ROWS + 1,
    })) as unknown as ProfileRow[];
    const truncatedUniverse = profiles.length > MAX_UNIVERSE_ROWS;
    const universe = profiles.slice(0, MAX_UNIVERSE_ROWS);

    const insufficient = await this.prisma.articleNormalizationProfile.count({
      where: {
        ...(companyFilter ? { companyCode: companyFilter } : {}),
        OR: [{ coverage: 'INSUFICIENTE' }, { coverage: null }],
      },
    });

    // Buckets: fingerprint no vacío + cada token técnico. Sin tokens
    // genéricos sueltos (§18): solo señales técnicas.
    const buckets = new Map<string, ProfileRow[]>();
    const addToBucket = (key: string, p: ProfileRow): void => {
      const list = buckets.get(key) ?? [];
      list.push(p);
      buckets.set(key, list);
    };
    for (const p of universe) {
      if (p.fingerprint && p.fingerprint.trim() !== '') addToBucket(`fp:${p.fingerprint}`, p);
      for (const t of technicalOf(p)) addToBucket(`tok:${t}`, p);
    }

    const decided = new Set(
      (await this.prisma.articleMatchDecision.findMany({ select: { pairKey: true } })).map((d) => d.pairKey),
    );

    let seeds = universe;
    if (opts.cursorCompanyCode || opts.cursorProfitCode) {
      const cc = (opts.cursorCompanyCode ?? '').trim().toUpperCase();
      const pc = (opts.cursorProfitCode ?? '').trim();
      seeds = universe.filter(
        (p) => p.companyCode > cc || (p.companyCode === cc && p.profitArticleCode > pc),
      );
    }
    if (companyFilter) seeds = seeds.filter((p) => p.companyCode === companyFilter);
    seeds = seeds.slice(0, maxSeeds);

    const progress: DetectProgress = {
      seedsProcessed: 0,
      pairsCompared: 0,
      relationsCreated: 0,
      relationsUpdated: 0,
      relationsSkippedDecided: 0,
      groupsCreated: 0,
      groupsUpdated: 0,
      bucketsTruncated: 0,
      insufficientProfiles: insufficient,
      elapsedMs: 0,
      nextCursor: null,
    };

    const comparedKeys = new Set<string>();
    const groupEdges: Array<{ a: string; b: string }> = [];

    for (const seed of seeds) {
      progress.seedsProcessed += 1;
      const mates = new Map<string, ProfileRow>();
      const seedTech = new Set(technicalOf(seed));
      if (seed.fingerprint && seed.fingerprint.trim() !== '') {
        for (const m of buckets.get(`fp:${seed.fingerprint}`) ?? []) mates.set(`${m.companyCode}:${m.profitArticleCode}`, m);
      }
      for (const t of seedTech) {
        for (const m of buckets.get(`tok:${t}`) ?? []) mates.set(`${m.companyCode}:${m.profitArticleCode}`, m);
      }
      mates.delete(`${seed.companyCode}:${seed.profitArticleCode}`);
      let mateList = [...mates.values()].sort((a, b) =>
        `${a.companyCode}:${a.profitArticleCode}` < `${b.companyCode}:${b.profitArticleCode}` ? -1 : 1,
      );
      if (mateList.length > maxBucketSize) {
        progress.bucketsTruncated += 1;
        mateList = mateList.slice(0, maxBucketSize);
      }
      const seedInput = inputOf(seed);
      for (const mate of mateList) {
        const key = pairKey(
          { companyCode: seed.companyCode, profitArticleCode: seed.profitArticleCode },
          { companyCode: mate.companyCode, profitArticleCode: mate.profitArticleCode },
        );
        if (comparedKeys.has(key)) continue;
        comparedKeys.add(key);
        if (decided.has(key)) {
          progress.relationsSkippedDecided += 1;
          continue;
        }
        const compared = comparePair(seedInput, snapshotOf(mate));
        if (!compared) continue;
        progress.pairsCompared += 1;
        const existed = await this.repository.findRelation(key);
        await this.repository.upsertRelation({
          pairKey: key,
          companyACode: key.split('|')[0]!.split(':')[0]!,
          profitACode: key.split('|')[0]!.split(':')[1]!,
          companyBCode: key.split('|')[1]!.split(':')[0]!,
          profitBCode: key.split('|')[1]!.split(':')[1]!,
          score: compared.score,
          classification: compared.classification,
          evidencesJson: JSON.stringify(compared.evidence),
          conflictsJson: JSON.stringify(compared.conflicts),
          explanation: compared.explanation,
          engineVersion: compared.engineVersion,
          coverageA: seed.coverage,
          coverageB: mate.coverage,
          evidenceCount: compared.evidence.length,
          conflictCount: compared.conflicts.length,
        });
        if (existed) progress.relationsUpdated += 1;
        else progress.relationsCreated += 1;
        if (
          (compared.classification === 'HIGH' || compared.classification === 'MEDIUM') &&
          compared.conflicts.length === 0
        ) {
          groupEdges.push({
            a: `${seed.companyCode}:${seed.profitArticleCode}`,
            b: `${mate.companyCode}:${mate.profitArticleCode}`,
          });
        }
      }
      progress.nextCursor = { companyCode: seed.companyCode, profitArticleCode: seed.profitArticleCode };
      if (progress.seedsProcessed % batchSize === 0) {
        this.logger.log(`detect: ${progress.seedsProcessed} semillas, ${progress.pairsCompared} pares`);
      }
    }

    const groupStats = await this.rebuildGroups(groupEdges);
    progress.groupsCreated = groupStats.created;
    progress.groupsUpdated = groupStats.updated;
    progress.elapsedMs = Date.now() - started;

    await this.auditoria
      .logEvent({
        correlationId: randomUUID(),
        actorId: opts.actorId,
        entityType: 'HistoricalDetection',
        entityId: companyFilter ?? 'ALL',
        action: 'HISTORICAL_DETECTION_RUN',
        afterData: JSON.stringify({ ...progress, truncatedUniverse }),
      })
      .catch((e: unknown) => this.logger.error(`Audit failed: ${(e as Error)?.message}`));
    return progress;
  }

  /**
   * Grupos = cliques maximales sobre aristas sin conflictos (HIGH/MEDIUM).
   * Componentes >40 nodos no se expanden (se registran, sin grupos falsos).
   */
  private async rebuildGroups(
    edges: Array<{ a: string; b: string }>,
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    if (edges.length === 0) return { created, updated };
    const adjacency = new Map<string, Set<string>>();
    const addEdge = (a: string, b: string): void => {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      if (!adjacency.has(b)) adjacency.set(b, new Set());
      adjacency.get(a)!.add(b);
      adjacency.get(b)!.add(a);
    };
    for (const e of edges) addEdge(e.a, e.b);

    const visited = new Set<string>();
    for (const start of [...adjacency.keys()].sort()) {
      if (visited.has(start)) continue;
      const component: string[] = [];
      const queue = [start];
      visited.add(start);
      while (queue.length > 0) {
        const n = queue.shift()!;
        component.push(n);
        for (const m of [...(adjacency.get(n) ?? [])].sort()) {
          if (!visited.has(m)) {
            visited.add(m);
            queue.push(m);
          }
        }
      }
      if (component.length < 2 || component.length > MAX_COMPONENT_NODES) continue;
      for (const clique of maximalCliques(component, adjacency)) {
        const members = clique.map((k) => {
          const [companyCode, profitArticleCode] = k.split(':');
          return { companyCode: companyCode!, profitArticleCode: profitArticleCode! };
        });
        const id = groupIdFor(members);
        const existed = await this.repository.findGroupWithMembers(id);
        await this.repository.upsertGroup({
          id,
          memberCount: members.length,
          engineVersion: 'v1',
          summaryJson: JSON.stringify({ members: clique, edgeCount: clique.length * (clique.length - 1) / 2 }),
        });
        await this.repository.replaceGroupMembers(id, members);
        if (existed) updated += 1;
        else created += 1;
      }
    }
    return { created, updated };
  }

  async getResumen() {
    const [total, analyzed, relations, groups, withConflicts, insufficient] = await Promise.all([
      this.prisma.articleNormalizationProfile.count(),
      this.prisma.articleNormalizationProfile.count({ where: { NOT: [{ coverage: 'INSUFICIENTE' }] } }),
      this.prisma.historicalMatchRelation.count(),
      this.prisma.historicalMatchGroup.count(),
      this.prisma.historicalMatchRelation.count({ where: { NOT: [{ conflictsJson: '[]' }] } }),
      this.prisma.articleNormalizationProfile.count({
        where: { OR: [{ coverage: 'INSUFICIENTE' }, { coverage: null }] },
      }),
    ]);
    const byClassification = await this.prisma.historicalMatchRelation.groupBy({
      by: ['classification'],
      _count: true,
    });
    return {
      historicalArticles: total,
      analyzed,
      insufficient,
      relations,
      groups,
      withConflicts,
      withoutConflicts: relations - withConflicts,
      byClassification: byClassification.map((r) => ({ classification: r.classification, count: r._count })),
    };
  }

  async listRelaciones(
    filters: {
      companyCode?: string;
      classification?: string;
      withConflicts?: boolean;
      coverage?: string;
      status?: string;
      code?: string;
      text?: string;
    },
    page: number,
    limit: number,
    order: { by: 'score' | 'classification' | 'detectedAt' | 'evidenceCount' | 'conflictCount'; dir: 'asc' | 'desc' },
  ) {
    const and: Record<string, unknown>[] = [];
    if (filters.companyCode) {
      const c = filters.companyCode.trim().toUpperCase();
      and.push({ OR: [{ companyACode: c }, { companyBCode: c }] });
    }
    if (filters.classification) and.push({ classification: filters.classification });
    if (filters.withConflicts === true) and.push({ NOT: [{ conflictsJson: '[]' }] });
    if (filters.withConflicts === false) and.push({ conflictsJson: '[]' });
    if (filters.coverage) and.push({ OR: [{ coverageA: filters.coverage }, { coverageB: filters.coverage }] });
    if (filters.status) and.push({ status: filters.status });
    if (filters.code) {
      and.push({ OR: [{ profitACode: { contains: filters.code } }, { profitBCode: { contains: filters.code } }] });
    }
    if (filters.text) {
      and.push({
        OR: [
          { explanation: { contains: filters.text } },
          { profitACode: { contains: filters.text } },
          { profitBCode: { contains: filters.text } },
        ],
      });
    }
    const where = and.length > 0 ? { AND: and } : {};
    const orderBy =
      order.by === 'score'
        ? [{ score: order.dir }, { pairKey: 'asc' as const }]
        : order.by === 'classification'
          ? [{ classification: order.dir }, { score: 'desc' as const }]
          : order.by === 'evidenceCount'
            ? [{ evidenceCount: order.dir }, { score: 'desc' as const }]
            : order.by === 'conflictCount'
              ? [{ conflictCount: order.dir }, { score: 'desc' as const }]
              : [{ detectedAt: order.dir }];
    const take = Math.max(1, Math.min(limit, 100));
    const safePage = Math.max(1, page);
    const [items, total] = await Promise.all([
      this.repository.findRelations({ where, orderBy: orderBy as Record<string, 'asc' | 'desc'>[], skip: (safePage - 1) * take, take }),
      this.repository.countRelations(where),
    ]);
    return { items, total, page: safePage, limit: take };
  }

  async listGrupos(page: number, limit: number, companyCode?: string) {
    const where: Record<string, unknown> = {};
    if (companyCode) {
      where.members = { some: { companyCode: companyCode.trim().toUpperCase() } };
    }
    const take = Math.max(1, Math.min(limit, 100));
    const safePage = Math.max(1, page);
    const [items, total] = await Promise.all([
      this.repository.findGroups({ where, skip: (safePage - 1) * take, take }),
      this.repository.countGroups(where),
    ]);
    return { items, total, page: safePage, limit: take };
  }

  async getRelacionesDeArticulo(companyCode: string, profitArticleCode: string, limit = 50) {
    const company = String(companyCode ?? '').trim().toUpperCase();
    const code = String(profitArticleCode ?? '').trim();
    if (!company || !code) throw new Error('Empresa y código son requeridos.');
    const items = await this.repository.findRelations({
      where: {
        OR: [
          { companyACode: company, profitACode: code },
          { companyBCode: company, profitBCode: code },
        ],
      },
      orderBy: [{ score: 'desc' }],
      take: Math.max(1, Math.min(limit, 100)),
    });
    return { items, total: items.length };
  }
}
