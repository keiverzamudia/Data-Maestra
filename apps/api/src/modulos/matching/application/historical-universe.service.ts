import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../comun/prisma/prisma.service';
import { ProfitAdapterService } from '../../profit/profit-adapter.service';
import { CorporateCompaniesService } from '../../profit/corporate-companies.service';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { profitDriver } from '../../profit/profit-driver';
import { DeterministicNormalizerV2 } from '../domain/matching-contracts';
import { assessCoverage, buildFingerprint, type CoverageLevel } from '../domain/historical-coverage';
import { NORMALIZATION_VERSION_V2 } from '../domain/text-normalizer';
import { escapeLike, splitSearchTokens, tokenVariants } from '../domain/search-tokens';
import { MatchingRepository } from '../infrastructure/matching.repository';

export const HISTORICAL_ORIGIN = 'HISTORICO';
const MAX_BATCH_SIZE = 500;
const MAX_BATCHES = 20;

interface HistoricalRow {
  co_art: string;
  art_des: string;
  co_lin: string;
  co_subl: string;
  co_cat: string;
  co_color: string;
  uni_venta: string;
  // FASE P1 — art.modelo/art.ref (char 20). `modelo` alimenta
  // profile.model (señal MODEL real); `ref` se lee y se descarta: en
  // Data-Maestra "Referencia" y "Part Number" son campos distintos.
  modelo?: string | null;
  ref?: string | null;
  // FASE 23.2 — referencias fotográficas de dbo.art (picture: image binario,
  // hoy siempre NULL; imagen1/imagen2: varchar(60), hoy espacios). Se
  // conservan tal cual cuando traen contenido real; si no, null.
  imagen1?: string | null;
  imagen2?: string | null;
}

/** FASE P3 — fila de la búsqueda manual en vivo sobre Profit. */
export interface ProfitSearchRow {
  co_art: string;
  art_des: string;
  co_color?: string | null;
  modelo?: string | null;
}

export interface IngestResult {
  companyCode: string;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  batches: number;
  errors: string[];
}

export interface HistoricalFilters {
  companyCode?: string;
  code?: string;
  text?: string;
  coverage?: CoverageLevel;
  hasTechnical?: boolean;
}

/**
 * FASE 22 — Auditoría y preparación del universo histórico de artículos.
 * Solo lectura en Profit (SELECT paginado por lotes) y escritura local de
 * derivados (perfiles). Sin matching histórico, sin homologación, sin
 * escritura Profit. El pool es perfiles locales; Fase 23 define candidatos.
 */
@Injectable()
export class HistoricalUniverseService {
  private readonly logger = new Logger(HistoricalUniverseService.name);
  private readonly normalizerV2 = new DeterministicNormalizerV2();
  private typeLib: any = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly profitAdapter: ProfitAdapterService,
    private readonly companies: CorporateCompaniesService,
    private readonly repository: MatchingRepository,
    private readonly auditoria: AuditoriaService,
  ) {}

  private async types(): Promise<any> {
    if (this.typeLib) return this.typeLib;
    this.typeLib = await profitDriver();
    return this.typeLib;
  }

  private static safeDb(code: string): string {
    const db = String(code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9_]{1,30}$/.test(db)) {
      throw new BadRequestException(`Código de empresa inválido: "${code}".`);
    }
    return db;
  }

  /** Página de artículos Profit (solo lectura, orden determinístico). */
  async listArticlesPage(companyCode: string, limit: number, offset: number): Promise<HistoricalRow[]> {
    const db = HistoricalUniverseService.safeDb(companyCode);
    const listed = await this.companies.isListed(db).catch(() => null);
    if (!listed) throw new NotFoundException(`Empresa Profit desconocida: ${db}.`);
    const mssql: any = await this.types();
    const take = Math.max(1, Math.min(limit, MAX_BATCH_SIZE));
    const skip = Math.max(0, offset);
    return this.profitAdapter.rawQuery<HistoricalRow>(
      `SELECT LTRIM(RTRIM(co_art)) AS co_art, LTRIM(RTRIM(art_des)) AS art_des,
        LTRIM(RTRIM(co_lin)) AS co_lin, LTRIM(RTRIM(co_subl)) AS co_subl,
        LTRIM(RTRIM(co_cat)) AS co_cat, LTRIM(RTRIM(co_color)) AS co_color,
        LTRIM(RTRIM(uni_venta)) AS uni_venta,
        LTRIM(RTRIM(modelo)) AS modelo, LTRIM(RTRIM(ref)) AS ref,
        CAST(imagen1 AS VARCHAR(60)) AS imagen1, CAST(imagen2 AS VARCHAR(60)) AS imagen2
       FROM [${db}].dbo.art ORDER BY co_art OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY`,
      {
        skip: { type: mssql.Int, value: skip },
        take: { type: mssql.Int, value: take },
      },
    );
  }

  /**
   * FASE P3 — consulta en vivo a Profit para la búsqueda manual.
   * Solo SELECT parametrizado sobre la empresa pedida (safeDb + isListed);
   * nunca concatena el término: viaja por request.input con los comodines
   * LIKE escapados. Orden determinístico y tope pequeño: es una búsqueda
   * dirigida, no una ingesta.
   *
   * FASE P5 — igual que el universo local: coincide POR PALABRAS (AND de
   * tokens en cualquier orden) usando la misma tokenización
   * (`search-tokens`), para que local y Profit respondan lo mismo.
   */
  async searchArticles(companyCode: string, term: string, limit: number): Promise<ProfitSearchRow[]> {
    const db = HistoricalUniverseService.safeDb(companyCode);
    const listed = await this.companies.isListed(db).catch(() => null);
    if (!listed) throw new NotFoundException(`Empresa Profit desconocida: ${db}.`);
    const q = (term ?? '').trim();
    if (q.length < 2) return [];
    const mssql: any = await this.types();
    const take = Math.max(1, Math.min(limit, 50));
    const params: Record<string, { type: any; value: any }> = {
      take: { type: mssql.Int, value: take },
    };
    const like = (value: string) => `%${escapeLike(value)}%`;
    const tokens = splitSearchTokens(q);
    let where: string;
    if (tokens.length === 0) {
      // Sin tokens utilizables → frase completa (comportamiento previo).
      params.pattern = { type: mssql.VarChar(120), value: like(q) };
      where =
        '(LTRIM(RTRIM(co_art)) LIKE @pattern OR LTRIM(RTRIM(art_des)) LIKE @pattern OR LTRIM(RTRIM(modelo)) LIKE @pattern)';
    } else {
      where = tokens
        .map((token, i) => {
          const clauses = tokenVariants(token).map((variant, j) => {
            const name = `t${i}_${j}`;
            params[name] = { type: mssql.VarChar(120), value: like(variant) };
            return (
              `LTRIM(RTRIM(co_art)) LIKE @${name} ` +
              `OR LTRIM(RTRIM(art_des)) LIKE @${name} ` +
              `OR LTRIM(RTRIM(modelo)) LIKE @${name}`
            );
          });
          return `(${clauses.join(' OR ')})`;
        })
        .join(' AND ');
    }
    return this.profitAdapter.rawQuery<ProfitSearchRow>(
      `SELECT TOP (@take) LTRIM(RTRIM(co_art)) AS co_art, LTRIM(RTRIM(art_des)) AS art_des,
        LTRIM(RTRIM(co_color)) AS co_color, LTRIM(RTRIM(modelo)) AS modelo
       FROM [${db}].dbo.art
       WHERE ${where}
       ORDER BY co_art`,
      params,
    );
  }

  /**
   * Ingesta por lotes con idempotencia por (companyCode, profitArticleCode):
   * solo crea o actualiza cuando cambia la representación o está incompleta.
   * Nunca O(n²); un SELECT paginado por lote + un upsert por fila.
   * FASE 23.2 — reanudable: `startOffset` permite continuar donde quedó una
   * llamada anterior (el universo supera el tope por llamada).
   */
  async ingestCompany(
    companyCode: string,
    opts: { batchSize?: number; maxBatches?: number; startOffset?: number; actorId?: string } = {},
  ): Promise<IngestResult> {
    const db = HistoricalUniverseService.safeDb(companyCode);
    await this.listArticlesPage(db, 1, 0).catch((e) => {
      if (e instanceof NotFoundException) throw e;
      throw new BadRequestException(`Empresa no legible: ${db}.`);
    });
    const batchSize = Math.max(1, Math.min(opts.batchSize ?? 200, MAX_BATCH_SIZE));
    const maxBatches = Math.max(1, Math.min(opts.maxBatches ?? 5, MAX_BATCHES));
    const startOffset = Math.max(0, opts.startOffset ?? 0);
    const brands = await this.prisma.brand.findMany({ where: { active: true }, select: { normalizedName: true } });
    const brandNames = brands.map((b) => b.normalizedName);
    const result: IngestResult = { companyCode: db, processed: 0, created: 0, updated: 0, skipped: 0, batches: 0, errors: [] };
    for (let b = 0; b < maxBatches; b += 1) {
      let rows: HistoricalRow[];
      try {
        rows = await this.listArticlesPage(db, batchSize, startOffset + b * batchSize);
      } catch (e: any) {
        result.errors.push(`Lote ${b}: ${String(e?.message ?? e).slice(0, 200)}`);
        break;
      }
      if (rows.length === 0) break;
      result.batches += 1;
      for (const row of rows) {
        result.processed += 1;
        try {
          const outcome = await this.ingestRow(db, row, brandNames);
          result[outcome] += 1;
        } catch (e: any) {
          result.errors.push(`${row.co_art}: ${String(e?.message ?? e).slice(0, 200)}`);
        }
      }
      if (rows.length < batchSize) break;
    }
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId: opts.actorId,
      entityType: 'HistoricalUniverse',
      entityId: db,
      action: 'HISTORICAL_INGESTED',
      afterData: JSON.stringify({
        companyCode: db, processed: result.processed, created: result.created,
        updated: result.updated, skipped: result.skipped, batches: result.batches,
        errors: result.errors.length,
      }),
    }).catch((e: any) => this.logger.error(`Audit failed: ${e?.message}`));
    return result;
  }

  private async ingestRow(db: string, row: HistoricalRow, brandNames: string[]): Promise<'created' | 'updated' | 'skipped'> {
    const code = (row.co_art ?? '').trim();
    if (!code) return 'skipped';
    const v2 = this.normalizerV2.normalize(
      {
        companyCode: db,
        description: row.art_des ?? '',
        brand: row.co_color?.trim() ? row.co_color : undefined,
        category: row.co_lin?.trim() ? row.co_lin : undefined,
        subCategory: row.co_subl?.trim() ? row.co_subl : undefined,
        unit: row.uni_venta?.trim() ? row.uni_venta : undefined,
        // FASE P1 — modelo real de Profit (art.modelo), no inferido del texto.
        model: row.modelo?.trim() ? row.modelo : undefined,
      },
      brandNames,
    );
    const model = row.modelo?.trim() ? row.modelo : null;
    const coverage = assessCoverage({
      normalizedDescription: v2.normalizedDescription,
      tokens: v2.tokens,
      technicalTokens: v2.technicalTokens,
      brand: v2.brandCandidate,
      model: v2.modelCandidate,
      partNumber: v2.partNumberCandidate,
      unit: v2.unitCanonical,
      category: row.co_lin?.trim() ? row.co_lin : undefined,
    });
    const fingerprint = buildFingerprint({
      technicalTokens: v2.technicalTokens,
      model: v2.modelCandidate,
      partNumber: v2.partNumberCandidate,
    });
    const current = await this.repository.findProfile(db, code);
    // FASE 23.2 — foto: solo se conserva referencia con contenido real
    // (hoy AD_TRANS trae espacios/NULL → null; sin inventar).
    const photoReference =
      [row.imagen1, row.imagen2].map((v) => String(v ?? '').trim()).find((v) => v !== '') ?? null;
    if (
      current &&
      current.normalizedDescription === v2.normalizedDescription &&
      current.normalizationVersion === NORMALIZATION_VERSION_V2 &&
      (current as { coverage?: string | null }).coverage === coverage &&
      (current as { fingerprint?: string | null }).fingerprint === fingerprint &&
      (current as { model?: string | null }).model === model &&
      (current as { photoReference?: string | null }).photoReference === photoReference
    ) {
      return 'skipped';
    }
    await this.repository.upsertProfile({
      companyCode: db,
      profitArticleCode: code,
      originalDescription: row.art_des ?? '',
      normalizedDescription: v2.normalizedDescription,
      normalizationVersion: NORMALIZATION_VERSION_V2,
      tokensJson: JSON.stringify(v2.tokens),
      featuresJson: JSON.stringify({
        technicalTokens: v2.technicalTokens,
        unitCanonical: v2.unitCanonical,
        modelCandidate: v2.modelCandidate,
        partNumberCandidate: v2.partNumberCandidate,
        brandCandidate: v2.brandCandidate,
      }),
      origin: current?.origin ?? HISTORICAL_ORIGIN,
      coverage,
      fingerprint,
      brand: row.co_color?.trim() ? row.co_color : null,
      model,
      category: row.co_lin?.trim() ? row.co_lin : null,
      subCategory: row.co_subl?.trim() ? row.co_subl : null,
      unit: row.uni_venta?.trim() ? row.uni_venta : null,
      photoReference,
    });
    return current ? 'updated' : 'created';
  }

  /** Métricas del universo preparado (local; Profit no se toca). */
  async getMetrics() {
    const [total, perCompany, coverageDist, withModel, withPartNumber, withBrand, withUnit, companies] = await Promise.all([
      this.prisma.articleNormalizationProfile.count(),
      this.prisma.articleNormalizationProfile.groupBy({ by: ['companyCode'], _count: true, orderBy: { companyCode: 'asc' } }),
      this.prisma.articleNormalizationProfile.groupBy({ by: ['coverage'], _count: true }),
      this.prisma.articleNormalizationProfile.count({ where: { NOT: [{ model: null }, { model: '' }] } }),
      this.prisma.articleNormalizationProfile.count({ where: { NOT: [{ partNumber: null }, { partNumber: '' }] } }),
      this.prisma.articleNormalizationProfile.count({ where: { NOT: [{ brand: null }, { brand: '' }] } }),
      this.prisma.articleNormalizationProfile.count({ where: { NOT: [{ unit: null }, { unit: '' }] } }),
      this.companies.listCompanies().catch(() => []),
    ]);
    const withDescription = await this.prisma.articleNormalizationProfile.count({
      where: { normalizedDescription: { not: '' } },
    });
    // Trazabilidad con Data-Maestra (sin heurísticas sobre descripciones):
    // - creado por DM: requestData.profitCode (código, sin empresa: limitación §9);
    // - vínculo preciso solicitud↔artículo: request_article_links.
    const dmCreated = await this.prisma.requestData.findMany({
      where: { NOT: [{ profitCode: null }, { profitCode: '' }] },
      select: { profitCode: true },
    });
    const links = await this.prisma.requestArticleLink.findMany({
      select: { requestId: true, companyCode: true, profitArticleCode: true, decision: true },
    });
    return {
      companiesDiscovered: companies.map((c) => c.code),
      total,
      perCompany: perCompany.map((p) => ({ companyCode: p.companyCode, count: p._count })),
      withDescription,
      withoutDescription: total - withDescription,
      withModel,
      withPartNumber,
      withBrand,
      withUnit,
      coverage: coverageDist.map((c) => ({ level: c.coverage ?? 'SIN_EVALUAR', count: c._count })),
      dmCreatedByCode: [...new Set((dmCreated ?? []).map((r) => r.profitCode).filter(Boolean))],
      linked: links ?? [],
    };
  }

  /** Consulta paginada del universo (filtros acotados, siempre con tope). */
  async listHistorical(filters: HistoricalFilters, page: number, limit: number) {
    const and: Record<string, unknown>[] = [];
    if (filters.companyCode) and.push({ companyCode: filters.companyCode.trim().toUpperCase() });
    if (filters.code) and.push({ profitArticleCode: { contains: filters.code.trim() } });
    if (filters.text) {
      and.push({
        OR: [
          { normalizedDescription: { contains: filters.text.trim() } },
          { originalDescription: { contains: filters.text.trim() } },
        ],
      });
    }
    if (filters.coverage) and.push({ coverage: filters.coverage });
    if (filters.hasTechnical) {
      // Proxy documentado: señal técnica estructurada (modelo/parte/unidad).
      and.push({
        OR: [
          { AND: [{ NOT: [{ model: null }, { model: '' }] }] },
          { AND: [{ NOT: [{ partNumber: null }, { partNumber: '' }] }] },
          { AND: [{ NOT: [{ unit: null }, { unit: '' }] }] },
        ],
      });
    }
    const where: Record<string, unknown> = and.length > 0 ? { AND: and } : {};
    const take = Math.max(1, Math.min(limit, 100));
    const skip = Math.max(0, (Math.max(1, page) - 1) * take);
    const [items, total] = await Promise.all([
      this.prisma.articleNormalizationProfile.findMany({
        where,
        orderBy: [{ companyCode: 'asc' }, { profitArticleCode: 'asc' }],
        skip,
        take,
      }),
      this.prisma.articleNormalizationProfile.count({ where }),
    ]);
    return { items, total, page: Math.max(1, page), limit: take };
  }
}
