import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../comun/prisma/prisma.service';
import { ProfitAdapterService } from '../../profit/profit-adapter.service';
import { CorporateCompaniesService } from '../../profit/corporate-companies.service';
import { AuditoriaService } from '../../auditoria/auditoria.service';
import { NORMALIZATION_VERSION_V2 } from '../domain/text-normalizer';
import { DeterministicNormalizerV1 } from '../domain/matching-contracts';
import { DeterministicNormalizerV2 } from '../domain/matching-contracts';
import type {
  ArticleMatchingInput,
  NormalizedProfile,
  NormalizedProfileV2,
} from '../domain/matching-contracts';
import { normalizePair, pairKey } from '../domain/article-identity';
import type { ProfitArticleId } from '../domain/article-identity';

/**
 * FASE 23.1 — Borrador del formulario de Almacén (datos aún no guardados).
 * Solo campos que existen en el modelo actual; nada artificial.
 */
export interface AnalyzerDraftInput {
  description?: string;
  purpose?: string;
  groupCode?: string;
  subgroupCode?: string;
  categoryCode?: string;
  brandCode?: string;
  unitCode?: string;
  taxType?: string;
  // FASE P1 — "Modelo" viajaba en el formulario de Almacén (FASE 24.2) pero
  // se perdía antes del motor: la señal MODEL_MATCH/CONFLICT jamás podía
  // dispararse desde el borrador.
  model?: string;
  partNumber?: string;
  application?: string;
}
import { assessCoverage, buildFingerprint } from '../domain/historical-coverage';import { DeterministicMatchEngineV1 } from '../domain/match-engine';
import type { ArticleSnapshot } from '../domain/match-engine';
import { normalizeTextV2 } from '../domain/text-normalizer';
import { MatchingRepository } from '../infrastructure/matching.repository';
import { HistoricalUniverseService } from './historical-universe.service';

/**
 * FASE P2 — búsqueda en dos tiempos del Analizador de Almacén.
 * INICIAL = solo la descripción de la solicitud (búsqueda automática).
 * COMPLETA = todos los campos del formulario (solo a petición del usuario,
 * cuando la clasificación ya está completa).
 */
export type AnalyzerPhase = 'INICIAL' | 'COMPLETA';

/** FASE P3 — origen de los resultados de la búsqueda manual. */
export type ManualSearchSource = 'LOCAL' | 'PROFIT';

/** FASE P3 — coincidencia devuelta por la búsqueda manual. */
export interface ManualSearchHit {
  companyCode: string;
  profitArticleCode: string;
  description: string;
  brand?: string;
  model?: string;
}

/** FASE P3 — resultado de la búsqueda manual de un artículo en Profit. */
export interface ManualSearchResult {
  companyCode: string;
  term: string;
  source: ManualSearchSource;
  results: ManualSearchHit[];
}

/**
 * FASE P4 — origen del universo Profit realmente consultado.
 * - EMPRESA_SOLICITUD: el código de la empresa de la solicitud es un código
 *   Profit del catálogo corporativo (TEmpresas) y por tanto universo válido.
 * - CONFIG_FALLBACK: no lo es (p. ej. el código de empresa local `EMP-A` del
 *   seed) y se usa la base Profit configurada (PROFIT_DB_DATABASE).
 */
export type UniverseSource = 'EMPRESA_SOLICITUD' | 'CONFIG_FALLBACK';

/** FASE P4 — universo resuelto + trazabilidad de por qué se eligió. */
export interface UniverseResolution {
  code: string;
  source: UniverseSource;
}

/**
 * FASE P4 — identificador de universo Profit: mismo criterio que usa el
 * catálogo corporativo (TEmpresas) y que usa HistoricalUniverseService.safeDb
 * antes de construir `[<empresa>].dbo.art`.
 */
const UNIVERSE_ID_RE = /^[A-Z0-9_]{1,30}$/;

/**
 * FASE 18 — Casos de uso del dominio matching (capa application).
 * Solo lectura en Profit (vía ProfitAdapter existente) y escritura en la
 * BD local (perfiles, decisiones, auditoría). PROFIT_WRITE_ENABLED intacto.
 */
@Injectable()
export class MatchingService {
  private readonly normalizer = new DeterministicNormalizerV1();
  private readonly normalizerV2 = new DeterministicNormalizerV2();

  constructor(
    private readonly prisma: PrismaService,
    private readonly profitAdapter: ProfitAdapterService,
    private readonly companies: CorporateCompaniesService,
    private readonly repository: MatchingRepository,
    private readonly auditoria: AuditoriaService,
    /**
     * FASE P3 — universo Profit en vivo. Es el respaldo de la búsqueda
     * manual cuando el artículo no está en los perfiles locales. Opcional
     * para no romper los constructores de los tests de las fases previas.
     */
    private readonly universe?: HistoricalUniverseService,
    /**
     * FASE P4 — fallback de universo (PROFIT_DB_DATABASE). Opcional por la
     * misma razón: los tests construyen el servicio a mano y, si no llega,
     * se recurre a process.env (mismo origen de verdad que la API).
     */
    @Optional() private readonly config?: ConfigService,
  ) {}

  /** Normalización pura de un input libre (no persiste, no lee Profit). */
  normalize(input: ArticleMatchingInput): NormalizedProfile {
    if (!input.description || !input.description.trim()) {
      throw new BadRequestException('La descripción es requerida para normalizar.');
    }
    return this.normalizer.normalize(input);
  }

  /**
   * FASE 19 — Normalización v2 con señales (pura salvo catálogo de marcas).
   * Las marcas se resuelven por coincidencia exacta contra
   * `brands.normalizedName` activos: sin diccionarios inventados.
   */
  async normalizeV2(input: ArticleMatchingInput): Promise<NormalizedProfileV2> {
    if (!input.description || !input.description.trim()) {
      throw new BadRequestException('La descripción es requerida para normalizar.');
    }
    const brands = await this.prisma.brand.findMany({
      where: { active: true },
      select: { normalizedName: true },
    });
    return this.normalizerV2.normalize(
      input,
      brands.map((b) => b.normalizedName),
    );
  }

  /**
   * Perfil de un artículo Profit (get-or-create local).
   * FASE 18: companyCode se valida contra TEmpresas y se persiste como
   * identidad; la lectura del artículo usa la conexión Profit configurada
   * (ProfitAdapter existente, sin segunda infraestructura). El enrutamiento
   * multi-empresa explícito llegará con el motor (FASE 19+).
   */
  async getOrCreateProfile(companyCode: string, profitArticleCode: string) {
    const company = (companyCode ?? '').trim().toUpperCase();
    const code = (profitArticleCode ?? '').trim();
    if (!company || !code) {
      throw new BadRequestException('companyCode y profitArticleCode son requeridos.');
    }
    const known = await this.companies.listCompanies().catch(() => []);
    if (known.length > 0 && !known.some((c) => c.code === company)) {
      throw new NotFoundException(`Empresa Profit desconocida: ${company}.`);
    }
    const existing = await this.repository.findProfile(company, code);
    if (existing) return existing;
    const article = await this.profitAdapter.getArticle(code);
    if (!article) {
      throw new NotFoundException(`Artículo ${company}:${code} no encontrado en Profit.`);
    }
    const v2 = await this.normalizeV2({
      companyCode: company,
      description: article.art_des,
      brand: article.co_color || undefined,
      category: article.co_lin || undefined,
      subCategory: article.co_subl || undefined,
      unit: article.uni_venta || undefined,
      model: article.modelo?.trim() ? article.modelo : undefined,
    });
    return this.repository.upsertProfile({
      companyCode: company,
      profitArticleCode: code,
      originalDescription: article.art_des,
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
      // FASE 22: cobertura y fingerprint desde la creación (origen legacy).
      coverage: assessCoverage({
        normalizedDescription: v2.normalizedDescription,
        tokens: v2.tokens,
        technicalTokens: v2.technicalTokens,
        brand: v2.brandCandidate,
        model: v2.modelCandidate,
        partNumber: v2.partNumberCandidate,
        unit: v2.unitCanonical,
        category: article.co_lin?.trim() ? article.co_lin : undefined,
      }),
      fingerprint: buildFingerprint({
        technicalTokens: v2.technicalTokens,
        model: v2.modelCandidate,
        partNumber: v2.partNumberCandidate,
      }),
      brand: article.co_color || null,
      model: article.modelo?.trim() ? article.modelo : null,
      category: article.co_lin || null,
      subCategory: article.co_subl || null,
      unit: article.uni_venta || null,
    });
  }

  /**
   * FASE 19 — Re-normalización controlada: perfil v1 (u otra versión
   * anterior) → v2 sin perder descripción original, referencia al artículo
   * ni historial (misma fila, version y normalizedAt actualizados).
   * No hay re-normalización masiva en esta fase.
   */
  async renormalizeProfile(companyCode: string, profitArticleCode: string) {
    const company = (companyCode ?? '').trim().toUpperCase();
    const code = (profitArticleCode ?? '').trim();
    if (!company || !code) {
      throw new BadRequestException('companyCode y profitArticleCode son requeridos.');
    }
    const current = await this.repository.findProfile(company, code);
    if (!current) {
      throw new NotFoundException(`Sin perfil previo para ${company}:${code}; cree el perfil primero.`);
    }
    if (current.normalizationVersion === NORMALIZATION_VERSION_V2) return current;
    const v2 = await this.normalizeV2({
      companyCode: company,
      description: current.originalDescription,
      brand: current.brand ?? undefined,
      category: current.category ?? undefined,
      subCategory: current.subCategory ?? undefined,
      unit: current.unit ?? undefined,
      model: current.model ?? undefined,
    });
    return this.repository.upsertProfile({
      companyCode: company,
      profitArticleCode: code,
      originalDescription: current.originalDescription,
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
      // FASE 22: preserva origen y recalcula cobertura/fingerprint.
      origin: (current as { origin?: string | null }).origin ?? null,
      coverage: assessCoverage({
        normalizedDescription: v2.normalizedDescription,
        tokens: v2.tokens,
        technicalTokens: v2.technicalTokens,
        brand: v2.brandCandidate,
        model: v2.modelCandidate,
        partNumber: v2.partNumberCandidate,
        unit: v2.unitCanonical,
        category: current.category,
      }),
      fingerprint: buildFingerprint({
        technicalTokens: v2.technicalTokens,
        model: v2.modelCandidate,
        partNumber: v2.partNumberCandidate,
      }),
      brand: current.brand,
      model: current.model,
      partNumber: current.partNumber,
      category: current.category,
      subCategory: current.subCategory,
      unit: current.unit,
      application: current.application,
      photoReference: current.photoReference,
    });
  }

  /**
   * Decisión humana SAME/DIFFERENT/REVIEW entre dos artículos.
   * Solo registra la decisión (+ auditoría). NO crea maestro, NO toca
   * Profit/catálogos/empresas. Pareja normalizada A/B (idempotente).
   */
  async registerDecision(
    a: ProfitArticleId,
    b: ProfitArticleId,
    decision: 'SAME' | 'DIFFERENT' | 'REVIEW',
    reason: string | undefined,
    actorId: string,
  ) {
    if (!a.companyCode || !a.profitArticleCode || !b.companyCode || !b.profitArticleCode) {
      throw new BadRequestException('Ambos artículos requieren companyCode y profitArticleCode.');
    }
    const { first, second } = normalizePair(a, b);
    const key = pairKey(a, b);
    const current = await this.repository.findDecision(key);
    if (current) return current;
    const created = await this.repository.createDecision({
      articleACompany: first.companyCode,
      articleAProfitCode: first.profitArticleCode,
      articleBCompany: second.companyCode,
      articleBProfitCode: second.profitArticleCode,
      pairKey: key,
      decision,
      reason: reason?.trim() ? reason.trim().slice(0, 500) : null,
      decidedBy: actorId,
    });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      entityType: 'ArticleMatchDecision',
      entityId: created.id,
      action: 'MATCH_DECISION_REGISTERED',
      afterData: JSON.stringify({ pairKey: key, decision }),
    });
    return created;
  }

  /**
   * Construye el input del futuro motor desde una solicitud existente.
   * Usa campos actuales (descripción, propósito, foto, empresa, clasificación
   * guardada). companyCode se resuelve del Company relacionado (mapeo
   * provisional documentado; el canónico llega con FASE 19+).
   */
  async buildInputFromRequest(requestId: string, companyCodeOverride?: string): Promise<ArticleMatchingInput> {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
      include: { requestData: true, company: { select: { code: true } } },
    });
    if (!request) throw new NotFoundException(`Solicitud ${requestId} no encontrada.`);
    const rd = request.requestData;
    return {
      companyCode: (companyCodeOverride ?? (request as unknown as { company?: { code?: string } }).company?.code ?? '').trim().toUpperCase(),
      // profitCode existe tras el registro (14L): permite autoexclusión y
      // respeto a decisiones previas sin inventar equivalencias.
      profitArticleCode: rd?.profitCode?.trim() ? rd.profitCode.trim() : undefined,
      description: request.requestedDescription,
      purpose: request.purpose ?? undefined,
      photoReference: request.referencePhotoUri ?? undefined,
      // brandCode = código Profit de marca/color elegido en Almacén;
      // manufacturer como respaldo.
      // FASE P1 — RequestData.model existe desde FASE 24.2: se usa ese dato
      // real. La versión anterior reutilizaba `manufacturer` como "modelo"
      // solo si además había brandCode, lo que inventaba una señal MODEL.
      brand: rd?.brandCode ?? rd?.manufacturer ?? undefined,
      model: rd?.model ?? undefined,
      partNumber: rd?.partNumber ?? undefined,
      category: rd?.groupId ?? undefined,
      subCategory: rd?.subgroupId ?? undefined,
      unit: rd?.unitCode ?? undefined,
      application: rd?.application ?? undefined,
    };
  }

  /**
   * FASE 20 — Consumo real de Almacén ("candidatos para esta solicitud").
   * Solicitud → input → normalización v2 → pool de perfiles locales →
   * preselección conservadora → motor → decisiones previas → auditoría.
   * Solo lectura (Profit ya leído al crear perfiles). Sin SAME automático.
   * FASE 21: enriquece con descripción del perfil y aplica el vínculo
   * solicitud→artículo (SAME anota, DIFFERENT excluye esa pareja).
   */
  async findCandidatesForRequest(requestId: string, companyCodeOverride?: string, actorId?: string) {
    const input = await this.buildInputFromRequest(requestId, companyCodeOverride);
    if (!input.description || !input.description.trim()) {
      throw new BadRequestException('No fue posible procesar la información.');
    }
    return this.runAnalysis(requestId, input, { actorId, phase: 'COMPLETA' });
  }

  /**
   * FASE P4 — resolución del universo Profit a consultar.
   *
   * Conviven dos namespaces distintos y hasta ahora se mezclaban:
   * - código de empresa Data-Maestra (`Company.code`, p. ej. `EMP-A` del seed);
   * - universo Profit (`TEmpresas.cod_emp`, p. ej. `AD_TRANS`), que es donde
   *   viven los perfiles y sobre lo que se construye `[<empresa>].dbo.art`.
   *
   * Regla (sin hardcodear ninguna solicitud):
   *  1. si el código candidato es un identificador válido Y está listado en
   *     el catálogo corporativo → se usa (universo real de esa empresa);
   *  2. si no → `PROFIT_DB_DATABASE` de la configuración;
   *  3. si tampoco hay config, se acepta el candidato válido (catálogo
   *     corporativo no disponible no debe tumbar el análisis);
   *  4. en último caso → 400, la misma protección de siempre.
   *
   * El motivo queda trazado en auditoría (`universeSource`).
   */
  private async resolveUniverseCompany(requestCompanyCode?: string): Promise<UniverseResolution> {
    const code = (requestCompanyCode ?? '').trim().toUpperCase();
    const valid = UNIVERSE_ID_RE.test(code);
    if (valid && (await this.isListedSafe(code)) === true) {
      return { code, source: 'EMPRESA_SOLICITUD' };
    }
    const configured = (
      this.config?.get<string>('PROFIT_DB_DATABASE') ?? process.env.PROFIT_DB_DATABASE ?? ''
    )
      .trim()
      .toUpperCase();
    if (UNIVERSE_ID_RE.test(configured)) {
      return { code: configured, source: 'CONFIG_FALLBACK' };
    }
    if (valid) return { code, source: 'EMPRESA_SOLICITUD' };
    throw new BadRequestException('La empresa del universo no es válida.');
  }

  /**
   * true/false = listado/no listado en TEmpresas; null = no se pudo
   * verificar (catálogo no disponible o servicio no inyectado en tests).
   */
  private async isListedSafe(code: string): Promise<boolean | null> {
    if (typeof this.companies?.isListed !== 'function') return null;
    try {
      return !!(await this.companies.isListed(code));
    } catch {
      return null;
    }
  }

  /**
   * FASE 23.1 — Analizador de Almacén: misma tubería que
   * findCandidatesForRequest pero con borrador del formulario (datos aún no
   * guardados) y universo acotado a la empresa de la solicitud.
   * Devuelve `insufficient: true` sin candidatos cuando no hay información
   * mínima; nunca inventa coincidencias.
   *
   * FASE 23.2 — Mapeo honesto del borrador (motor congelado FASE 20, sin
   * señales nuevas):
   * - description, purpose, brandCode→brand, partNumber, groupCode→category,
   *   subgroupCode→subCategory, unitCode→unit, application: señales reales.
   * - categoryCode (co_cat Profit): los perfiles históricos no la conservan
   *   (solo co_lin→category); no existe señal compatible → se ignora.
   * - taxType: no es señal del motor (el impuesto no identifica artículos).
   * - articleType (tipo C/S/V…): los perfiles no conservan tipo → sin señal.
   * Nada se inventa: lo no mapeable se documenta aquí, no se fuerza.
   *
   * FASE P1 — universo y trazabilidad:
   * - `actorId` se registra en la auditoría (antes quedaba `undefined`);
   * - `poolTotal/poolLimit/poolTruncated` hacen visible el tope de 500
   *   perfiles, que antes era un corte silencioso.
   * - model viaja desde el borrador (señal MODEL_MATCH/CONFLICT real).
   *
   * FASE P2 — `phase`:
   * - 'INICIAL' (automática): solo descripción y propósito. Ningún select de
   *   clasificación participa, así el usuario ve candidatos desde el primer
   *   momento sin depender de un formulario a medio llenar.
   * - 'COMPLETA' (por defecto y a petición del usuario): todos los campos.
   *   Es la comparación definitiva que se dispara con "Validar artículo".
   *
   * FASE P4 — el universo se resuelve con `resolveUniverseCompany` (empresa
   * de la solicitud solo si es código Profit listado; si no, configuración).
   * Antes de esto, un código de empresa local con guion (`EMP-A`) hacía
   * fallar toda consulta con 400 'La empresa del universo no es válida.'.
   */
  async analyzeDraft(
    requestId: string,
    draft: AnalyzerDraftInput,
    opts: { universeCompanyCode?: string; limit?: number; actorId?: string; phase?: AnalyzerPhase } = {},
  ) {
    const base = await this.buildInputFromRequest(requestId);
    const universe = await this.resolveUniverseCompany(opts.universeCompanyCode ?? base.companyCode);
    const phase: AnalyzerPhase = opts.phase ?? 'COMPLETA';
    const input: ArticleMatchingInput = phase === 'INICIAL'
      ? {
          // FASE P2 — primera pasada: únicamente texto libre. Se descartan
          // deliberadamente los campos guardados de la solicitud (marca,
          // grupo, unidad, parte, aplicación): si viajaran, la "búsqueda
          // por descripción" seguiría siendo una búsqueda por clasificación.
          companyCode: base.companyCode,
          profitArticleCode: base.profitArticleCode,
          photoReference: base.photoReference,
          description: draft.description ?? base.description,
          purpose: draft.purpose ?? base.purpose,
        }
      : {
          ...base,
          description: draft.description ?? base.description,
          purpose: draft.purpose ?? base.purpose,
          brand: draft.brandCode ?? base.brand,
          model: draft.model ?? base.model,
          partNumber: draft.partNumber ?? base.partNumber,
          category: draft.groupCode ?? base.category,
          subCategory: draft.subgroupCode ?? base.subCategory,
          unit: draft.unitCode ?? base.unit,
          application: draft.application ?? base.application,
        };
    return this.runAnalysis(requestId, input, {
      universeCompanyCode: universe.code,
      universeSource: universe.source,
      limit: opts.limit,
      actorId: opts.actorId,
      phase,
    });
  }

  /**
   * FASE P3 — Búsqueda manual de un artículo en Profit, a petición del usuario.
   *
   * Dos pasos, en este orden:
   *  1) universo local (perfiles ya normalizados): rápido y sin tocar Profit;
   *  2) si no está, consulta en vivo a Profit para esa empresa.
   *
   * Es solo una consulta de existencia/descarte: no decide nada, no vincula
   * y no escribe en Profit. La trazabilidad queda en la auditoría.
   *
   * FASE P4 — el universo se resuelve con `resolveUniverseCompany` (mismo
   * criterio que el analizador), no con el código de empresa en crudo.
   */
  async searchManualArticle(
    requestId: string,
    term: string,
    opts: { limit?: number; actorId?: string } = {},
  ): Promise<ManualSearchResult> {
    const t = (term ?? '').trim();
    if (t.length < 2) {
      throw new BadRequestException('Escribe al menos 2 caracteres para buscar el artículo.');
    }
    if (t.length > 60) {
      throw new BadRequestException('El texto de búsqueda no puede superar los 60 caracteres.');
    }
    const base = await this.buildInputFromRequest(requestId);
    // FASE P4 — mismo criterio que el analizador: la empresa de la solicitud
    // solo si es código Profit listado; si no, la base configurada. Así la
    // búsqueda local mira donde realmente están los perfiles (AD_TRANS) y el
    // respaldo en vivo no recibe un código que safeDb rechazaría (400).
    const universe = await this.resolveUniverseCompany(base.companyCode);
    const company = universe.code;
    const limit = Math.max(1, Math.min(opts.limit ?? 20, 50));

    // 1) Universo local primero.
    const local = await this.repository.searchProfiles(company, t, limit);
    let source: ManualSearchSource = 'LOCAL';
    let results: ManualSearchHit[] = local.map((p) => ({
      companyCode: p.companyCode,
      profitArticleCode: p.profitArticleCode,
      description: p.originalDescription,
      brand: p.brand ?? undefined,
      model: p.model ?? undefined,
    }));

    // 2) Respaldo: consulta en vivo a Profit (solo si el local no lo tiene).
    if (results.length === 0 && this.universe) {
      const rows = await this.universe.searchArticles(company, t, limit);
      source = 'PROFIT';
      results = rows.map((r) => ({
        companyCode: company,
        profitArticleCode: r.co_art,
        description: r.art_des,
        brand: r.co_color ?? undefined,
        model: r.modelo ?? undefined,
      }));
    }

    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      requestId,
      actorId: opts.actorId,
      entityType: 'MatchQuery',
      entityId: requestId,
      action: 'MANUAL_ARTICLE_SEARCH',
      afterData: JSON.stringify({
        term: t,
        companyCode: company,
        universeSource: universe.source,
        source,
        count: results.length,
      }),
    });

    return { companyCode: company, term: t, source, results };
  }

  private async runAnalysis(
    requestId: string,
    input: ArticleMatchingInput,
    opts: { universeCompanyCode?: string; universeSource?: UniverseSource; limit?: number; actorId?: string; phase?: AnalyzerPhase },
  ) {
    const v2 = await this.normalizeV2Safe(input);
    if (!v2 || this.isInsufficient(input, v2)) {
      await this.auditoria.logEvent({
        correlationId: randomUUID(),
        requestId,
        actorId: opts.actorId,
        entityType: 'MatchQuery',
        entityId: requestId,
        action: 'MATCH_CANDIDATES_CONSULTED',
        afterData: JSON.stringify({
          count: 0,
          insufficient: true,
          engineVersion: 'v1',
          phase: opts.phase ?? 'COMPLETA',
          universeCompanyCode: opts.universeCompanyCode,
          universeSource: opts.universeSource,
        }),
      });
      return {
        input,
        candidates: [],
        insufficient: true as const,
        engineVersion: 'v1' as const,
        phase: opts.phase ?? 'COMPLETA' as AnalyzerPhase,
      };
    }
    const poolLimit = 500;
    const profiles = await this.repository.listProfiles(poolLimit, opts.universeCompanyCode);
    const poolTotal = await this.poolTotal(opts.universeCompanyCode);
    const poolTruncated = typeof poolTotal === 'number' && poolTotal > profiles.length;
    const byKey = new Map(
      profiles.map((p: Record<string, any>) => [
        `${p.companyCode}:${p.profitArticleCode}`,
        {
          description: String(p.originalDescription ?? p.normalizedDescription ?? ''),
          detail: {
            originalDescription: String(p.originalDescription ?? ''),
            normalizedDescription: String(p.normalizedDescription ?? ''),
            brand: p.brand ?? undefined,
            model: p.model ?? undefined,
            partNumber: p.partNumber ?? undefined,
            category: p.category ?? undefined,
            subCategory: p.subCategory ?? undefined,
            unit: p.unit ?? undefined,
            application: p.application ?? undefined,
            // FASE 23.2 — referencia fotográfica del artículo existente
            // (null cuando AD_TRANS no trae foto; la UI muestra aviso).
            photo: (p.photoReference ?? '').trim() ? String(p.photoReference).trim() : undefined,
          },
        },
      ]),
    );
    const preselected = this.preselect(input, v2, profiles);
    const engine = new DeterministicMatchEngineV1({
      listCandidates: async () => preselected,
    });
    const engineInput: ArticleMatchingInput = { ...input };
    let candidates = (await engine.findCandidates(engineInput)).map((c) => {
      const info = byKey.get(`${c.article.companyCode}:${c.article.profitArticleCode}`);
      return {
        ...c,
        description: info?.description ?? '',
        detail: info?.detail,
      };
    });

    if (input.profitArticleCode) {
      const prior = await this.repository.findDecisionsInvolving(
        input.companyCode,
        input.profitArticleCode,
      );
      const different = new Set(
        prior.filter((d) => d.decision === 'DIFFERENT').map((d) => d.pairKey),
      );
      const same = new Map(prior.filter((d) => d.decision === 'SAME').map((d) => [d.pairKey, d.decision] as const));
      candidates = candidates
        .filter((c) => {
          const other = { companyCode: c.article.companyCode, profitArticleCode: c.article.profitArticleCode };
          return !different.has(pairKey({ companyCode: input.companyCode, profitArticleCode: input.profitArticleCode! }, other));
        })
        .map((c) => {
          const other = { companyCode: c.article.companyCode, profitArticleCode: c.article.profitArticleCode };
          const key = pairKey({ companyCode: input.companyCode, profitArticleCode: input.profitArticleCode! }, other);
          const decision = same.get(key);
          return decision ? { ...c, priorDecision: decision as 'SAME' } : c;
        });
    }

    const link = await this.repository.findRequestLink(requestId);
    // FASE 23.2 — Historial completo por par (solicitud, artículo): todos los
    // DIFFERENT excluyen (no solo el último), todos los SAME se marcan. El
    // vínculo vigente (link) conserva la compatibilidad con FASE 21.
    const history: Array<{ companyCode: string; profitArticleCode: string; decision: string }> =
      typeof this.repository.listRequestDecisions === 'function'
        ? await this.repository.listRequestDecisions(requestId)
        : [];
    const differentKeys = new Set(
      history.filter((d) => d.decision === 'DIFFERENT')
        .map((d) => `${d.companyCode}:${d.profitArticleCode}`),
    );
    const sameKeys = new Set(
      history.filter((d) => d.decision === 'SAME')
        .map((d) => `${d.companyCode}:${d.profitArticleCode}`),
    );
    if (link) {
      const key = `${link.companyCode}:${link.profitArticleCode}`;
      if (link.decision !== 'DIFFERENT') sameKeys.add(key);
      else differentKeys.add(key);
    }
    if (differentKeys.size > 0 || sameKeys.size > 0) {
      candidates = candidates
        .filter((c) => !differentKeys.has(`${c.article.companyCode}:${c.article.profitArticleCode}`))
        .map((c) => (
          sameKeys.has(`${c.article.companyCode}:${c.article.profitArticleCode}`)
            ? { ...c, priorDecision: 'SAME' as const }
            : c
        ));
    }

    const limited = opts.limit === undefined ? candidates : candidates.slice(0, Math.max(1, Math.min(opts.limit, 20)));
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      requestId,
      actorId: opts.actorId,
      entityType: 'MatchQuery',
      entityId: requestId,
      action: 'MATCH_CANDIDATES_CONSULTED',
      afterData: JSON.stringify({
        count: limited.length,
        engineVersion: 'v1',
        phase: opts.phase ?? 'COMPLETA',
        universeCompanyCode: opts.universeCompanyCode,
        universeSource: opts.universeSource,
        poolTruncated,
      }),
    });
    return {
      input,
      candidates: limited,
      insufficient: false as const,
      engineVersion: 'v1' as const,
      phase: (opts.phase ?? 'COMPLETA') as AnalyzerPhase,
      poolTotal,
      poolLimit,
      poolTruncated,
    };
  }

  /**
   * FASE P1 — tamaño real del universo consultado (solo local). Devuelve
   * null cuando no se puede determinar: la señal de truncamiento es
   * opcional y jamás bloquea el análisis.
   */
  private async poolTotal(universeCompanyCode?: string): Promise<number | null> {
    if (typeof this.repository.countProfiles !== 'function') return null;
    try {
      return await this.repository.countProfiles(universeCompanyCode);
    } catch {
      return null;
    }
  }

  /** Normalización tolerante: null si no hay descripción que normalizar. */
  private async normalizeV2Safe(input: ArticleMatchingInput) {
    if (!input.description || !input.description.trim()) return null;
    try {
      return await this.normalizeV2(input);
    } catch {
      return null;
    }
  }

  /**
   * Información mínima para analizar: descripción con tokens o alguna
   * señal estructurada (modelo, parte, marca, unidad, categoría,
   * aplicación). Sin esto no se generan candidatos débiles.
   */
  private isInsufficient(input: ArticleMatchingInput, v2: NormalizedProfileV2): boolean {
    if (v2.tokens.length > 0) return false;
    const fields = [input.model, input.partNumber, input.brand, input.unit, input.category, input.subCategory, input.application];
    return !fields.some((f) => (f ?? '').trim() !== '');
  }

  /**
   * FASE 21 — Vincula una solicitud con un artículo Profit existente
   * (decisión SAME/DIFFERENT de Almacén). Solo en PENDIENTE_ALMACEN, con
   * el candidato verificado por lectura en Profit. No crea maestros, no
   * toca Profit, no cambia el workflow: registra el vínculo + auditoría.
   * SAME permite reutilizar el código y evitar un duplicado en el registro.
   *
   * FASE 23.2 — Historial + idempotencia: cada decisión se conserva por par
   * (upsert por tripleta; repetir la misma decisión no duplica). El vínculo
   * vigente (RequestArticleLink) refleja la última decisión. Almacén bloquea
   * la aprobación con SAME activo y el registro en Profit se omite
   * (PROFIT_WRITE_SKIPPED_EXISTING); ver AlmacenService y SolicitudesService.
   */
  async linkRequestToExisting(
    requestId: string,
    companyCode: string,
    profitArticleCode: string,
    decision: 'SAME' | 'DIFFERENT',
    actorId: string,
  ) {
    const company = (companyCode ?? '').trim().toUpperCase();
    const code = (profitArticleCode ?? '').trim();
    if (!company || !code) {
      throw new BadRequestException('La empresa y el código del artículo son requeridos.');
    }
    const request = await this.prisma.request.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException(`Solicitud ${requestId} no encontrada.`);
    if (request.status !== 'PENDIENTE_ALMACEN') {
      throw new BadRequestException('La solicitud ya no está en revisión de Almacén.');
    }
    const article = await this.profitAdapter.getArticle(code);
    if (!article) {
      throw new NotFoundException(`Artículo ${company}:${code} no encontrado en Profit.`);
    }
    const link = await this.repository.upsertRequestLink({
      requestId,
      companyCode: company,
      profitArticleCode: code,
      decision,
      decidedBy: actorId,
    });
    // FASE 23.2 — historial por par (idempotente; no sobrescribe otras parejas).
    if (typeof this.repository.upsertRequestDecision === 'function') {
      await this.repository.upsertRequestDecision({
        requestId,
        companyCode: company,
        profitArticleCode: code,
        decision,
        decidedBy: actorId,
      });
    }
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      requestId,
      actorId,
      entityType: 'RequestArticleLink',
      entityId: link.id,
      action: 'MATCH_REQUEST_LINKED',
      afterData: JSON.stringify({ companyCode: company, profitArticleCode: code, decision }),
    });
    return link;
  }

  /**
   * Preselección conservadora sobre perfiles locales: pasa si comparte
   * ≥1 token técnico, marca/modelo/parte, o ≥2 tokens comunes. Sin señales
   * utilizables en el input no se descarta nada (tope determinístico).
   *
   * FASE P1 — `v2.brandCandidate` es un NOMBRE normalizado (catálogo de
   * marcas) mientras `p.brand` guarda `art.co_color`, un CÓDIGO: compararlos
   * hacía que la preselección por marca nunca coincidiera. Ahora la marca se
   * compara con `input.brand` (código elegido en Almacén), mismo dominio.
   */
  private preselect(input: ArticleMatchingInput, v2: NormalizedProfileV2, profiles: Array<Record<string, any>>): ArticleSnapshot[] {
    const tech = new Set(v2.technicalTokens);
    const toks = new Set(v2.tokens);
    const hasSignals =
      tech.size > 0 || v2.brandCandidate !== null || v2.modelCandidate !== null || v2.partNumberCandidate !== null;
    const out: ArticleSnapshot[] = [];
    for (const p of profiles) {
      const snapshot: ArticleSnapshot = {
        article: { companyCode: p.companyCode, profitArticleCode: p.profitArticleCode },
        description: p.normalizedDescription ?? p.originalDescription ?? '',
        brand: p.brand ?? undefined,
        model: p.model ?? undefined,
        partNumber: p.partNumber ?? undefined,
        category: p.category ?? undefined,
        subCategory: p.subCategory ?? undefined,
        unit: p.unit ?? undefined,
        application: p.application ?? undefined,
      };
      if (!hasSignals) {
        out.push(snapshot);
        continue;
      }
      let features: { technicalTokens: string[] } = { technicalTokens: [] };
      try {
        features = { technicalTokens: JSON.parse(p.featuresJson ?? '[]').technicalTokens ?? [] };
      } catch {
        features = { technicalTokens: [] };
      }
      const pTech = new Set([
        ...features.technicalTokens,
        ...normalizeTextV2(p.normalizedDescription ?? '').split(' ').filter(Boolean),
      ]);
      let sharedTech = 0;
      for (const t of tech) {
        if (pTech.has(t)) sharedTech += 1;
      }
      const pToks = new Set(normalizeTextV2(p.normalizedDescription ?? '').split(' ').filter(Boolean));
      let shared = 0;
      for (const t of toks) {
        if (pToks.has(t)) shared += 1;
      }
      const normEq = (a: unknown, b: unknown): boolean => {
        const x = String(a ?? '').trim();
        const y = String(b ?? '').trim();
        return x !== '' && x === y;
      };
      const strongField =
        normEq(input.brand, p.brand) ||
        normEq(input.model, p.model) ||
        normEq(input.partNumber, p.partNumber) ||
        (v2.modelCandidate && normEq(v2.modelCandidate, p.model)) ||
        (v2.partNumberCandidate && normEq(v2.partNumberCandidate, p.partNumber)) ||
        (v2.brandCandidate && normEq(v2.brandCandidate, p.brand));
      if (sharedTech >= 1 || shared >= 2 || strongField) {
        out.push(snapshot);
      }
    }
    return out;
  }
}
