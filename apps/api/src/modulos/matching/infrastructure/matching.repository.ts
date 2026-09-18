import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../comun/prisma/prisma.service';

/**
 * FASE 18 — Acceso a persistencia del dominio matching (capa infrastructure).
 * Prisma puro, sin reglas de negocio: el orden canónico A/B y la unicidad
 * de parejas se garantizan en application antes de llamar aquí.
 */
@Injectable()
export class MatchingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProfile(companyCode: string, profitArticleCode: string) {
    return this.prisma.articleNormalizationProfile.findUnique({
      where: { companyCode_profitArticleCode: { companyCode, profitArticleCode } },
    });
  }

  upsertProfile(data: {
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
    photoReference?: string | null;
  }) {
    const { companyCode, profitArticleCode, ...rest } = data;
    return this.prisma.articleNormalizationProfile.upsert({
      where: { companyCode_profitArticleCode: { companyCode, profitArticleCode } },
      create: { companyCode, profitArticleCode, ...rest },
      update: { ...rest, normalizedAt: new Date() },
    });
  }

  findDecision(pairKey: string) {
    return this.prisma.articleMatchDecision.findUnique({ where: { pairKey } });
  }

  /** Perfiles locales como pool de candidatos (orden determinístico, tope). */
  listProfiles(limit: number, companyCode?: string) {
    const code = (companyCode ?? '').trim().toUpperCase();
    return this.prisma.articleNormalizationProfile.findMany({
      where: code ? { companyCode: code } : {},
      orderBy: [{ companyCode: 'asc' }, { profitArticleCode: 'asc' }],
      take: Math.max(1, Math.min(limit, 500)),
    });
  }

  /** Decisiones que involucran a un artículo (en cualquier posición). */
  findDecisionsInvolving(companyCode: string, profitArticleCode: string) {
    return this.prisma.articleMatchDecision.findMany({
      where: {
        OR: [
          { articleACompany: companyCode, articleAProfitCode: profitArticleCode },
          { articleBCompany: companyCode, articleBProfitCode: profitArticleCode },
        ],
      },
    });
  }

  /** Vínculo solicitud → artículo existente (estado vigente: última decisión). */
  findRequestLink(requestId: string) {
    return this.prisma.requestArticleLink.findUnique({ where: { requestId } });
  }

  upsertRequestLink(data: {
    requestId: string;
    companyCode: string;
    profitArticleCode: string;
    decision: string;
    decidedBy?: string | null;
  }) {
    const { requestId, ...rest } = data;
    return this.prisma.requestArticleLink.upsert({
      where: { requestId },
      create: { requestId, ...rest },
      update: { ...rest, decidedAt: new Date() },
    });
  }

  /**
   * FASE 23.2 — Historial por par (solicitud, artículo): idempotente por
   * tripleta. Múltiples DIFFERENT coexisten; repetir la misma decisión no
   * crea filas nuevas.
   */
  upsertRequestDecision(data: {
    requestId: string;
    companyCode: string;
    profitArticleCode: string;
    decision: string;
    decidedBy?: string | null;
  }) {
    const { requestId, companyCode, profitArticleCode, ...rest } = data;
    return this.prisma.requestArticleDecision.upsert({
      where: { requestId_companyCode_profitArticleCode: { requestId, companyCode, profitArticleCode } },
      create: { requestId, companyCode, profitArticleCode, ...rest },
      update: { ...rest, decidedAt: new Date() },
    });
  }

  /** Todas las decisiones de una solicitud, orden determinístico. */
  listRequestDecisions(requestId: string) {
    return this.prisma.requestArticleDecision.findMany({
      where: { requestId },
      orderBy: [{ decidedAt: 'asc' }, { companyCode: 'asc' }, { profitArticleCode: 'asc' }],
    });
  }

  createDecision(data: {
    articleACompany: string;
    articleAProfitCode: string;
    articleBCompany: string;
    articleBProfitCode: string;
    pairKey: string;
    decision: string;
    reason?: string | null;
    decidedBy?: string | null;
  }) {
    return this.prisma.articleMatchDecision.create({ data });
  }

  // FASE 23 — Relaciones históricas (upsert idempotente por pairKey).

  upsertRelation(data: {
    pairKey: string;
    companyACode: string;
    profitACode: string;
    companyBCode: string;
    profitBCode: string;
    score: number;
    classification: string;
    evidencesJson: string;
    conflictsJson: string;
    explanation: string;
    engineVersion: string;
    coverageA?: string | null;
    coverageB?: string | null;
    evidenceCount?: number;
    conflictCount?: number;
  }) {
    const { pairKey, ...rest } = data;
    return this.prisma.historicalMatchRelation.upsert({
      where: { pairKey },
      create: { pairKey, ...rest },
      update: { ...rest },
    });
  }

  findRelation(pairKey: string) {
    return this.prisma.historicalMatchRelation.findUnique({ where: { pairKey } });
  }

  countRelations(where: Record<string, unknown> = {}) {
    return this.prisma.historicalMatchRelation.count({ where });
  }

  findRelations(args: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, 'asc' | 'desc'>[];
    skip?: number;
    take?: number;
  }) {
    return this.prisma.historicalMatchRelation.findMany({
      where: args.where ?? {},
      orderBy: args.orderBy ?? [{ score: 'desc' }],
      skip: args.skip ?? 0,
      take: Math.max(1, Math.min(args.take ?? 25, 100)),
    });
  }

  // FASE 23 — Grupos conservadores (id determinístico por miembros).

  upsertGroup(data: { id: string; memberCount: number; engineVersion: string; summaryJson?: string | null }) {
    const { id, ...rest } = data;
    return this.prisma.historicalMatchGroup.upsert({
      where: { id },
      create: { id, ...rest },
      update: { ...rest },
    });
  }

  replaceGroupMembers(groupId: string, members: Array<{ companyCode: string; profitArticleCode: string }>) {
    return this.prisma.$transaction([
      this.prisma.historicalMatchGroupMember.deleteMany({ where: { groupId } }),
      this.prisma.historicalMatchGroupMember.createMany({
        data: members.map((m) => ({ groupId, companyCode: m.companyCode, profitArticleCode: m.profitArticleCode })),
      }),
    ]);
  }

  findGroupWithMembers(id: string) {
    return this.prisma.historicalMatchGroup.findUnique({
      where: { id },
      include: { members: { orderBy: [{ companyCode: 'asc' }, { profitArticleCode: 'asc' }] } },
    });
  }

  countGroups(where: Record<string, unknown> = {}) {
    return this.prisma.historicalMatchGroup.count({ where });
  }

  findGroups(args: { where?: Record<string, unknown>; skip?: number; take?: number }) {
    return this.prisma.historicalMatchGroup.findMany({
      where: args.where ?? {},
      orderBy: [{ memberCount: 'desc' }, { detectedAt: 'desc' }],
      skip: args.skip ?? 0,
      take: Math.max(1, Math.min(args.take ?? 25, 100)),
      include: { members: { orderBy: [{ companyCode: 'asc' }, { profitArticleCode: 'asc' }] } },
    });
  }
}
