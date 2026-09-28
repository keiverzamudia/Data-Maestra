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
import { assessCoverage, buildFingerprint } from '../domain/historical-coverage';
import {
  DeterministicMatchEngineV1,
  comparePair,
  descriptionTokens,
  tolerantSimilarity,
} from '../domain/match-engine';
import type { ArticleSnapshot, EngineCandidate } from '../domain/match-engine';
import { MATCH_TUNING } from '../domain/match-tuning';
import { MatchingRepository } from '../infrastructure/matching.repository';
import { HistoricalUniverseService } from './historical-universe.service';

/**
 * FASE P2 — búsqueda en dos tiempos del Analizador de Almacén.
 * INICIAL = solo la descripción de la solicitud (búsqueda automática).
 * COMPLETA = todos los campos del formulario (solo a petición del usuario,
 * cuando la clasificación ya está completa).
 */
export type AnalyzerPhase = 'INICIAL' | 'COMPLETA';

/**
 * FASE P4 — Propuesta manual del usuario en el Analizador.
 *
 * Cuando la búsqueda manual encuentra un artículo que el usuario cree que
 * puede ser, lo "agrega a sus coincidencias": ese hallazgo se persiste como
 * decisión PROPUESTA por (solicitud, empresa, artículo). Es la nota del
 * usuario, no una decisión SAME/DIFFERENT del motor ni del workflow.
 *
 * Por eso es un valor propio y no parte de MatchDecisionKind:
 *  - `runAnalysis` solo lee SAME/DIFFERENT → PROPUESTA no filtra, no marca
 *    ni contamina los candidatos del motor;
 *  - "Es este" (`linkRequestToExisting`) hace upsert sobre la MISMA tripleta
 *    y la propuesta se convierte en SAME sin duplicar filas;
 *  - "Quitar propuesta" borra solo filas PROPUESTA, nunca decisiones.
 */
export const REQUEST_PROPOSAL_DECISION = 'PROPUESTA';

/** FASE P4 — candidato del motor enriquecido con perfil + marca manual. */
export type ManualProposalCandidate = EngineCandidate & {
  description: string;
  detail: Record<string, any>;
  manual: true;
};

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

  /**
   * Recall multicanal: el análisis ya no se limita a los primeros 500
   * perfiles por código (ese corte arbitrario dejaba fuera coincidencias
   * reales). El recall corre sobre el universo local completo y combina:
   *  1) prefiltrado en memoria con solape tolerante (motor, no literal);
   *  2) canal LIKE por palabras sobre el espejo local (literales);
   *  3) respaldo en vivo a Profit solo cuando el local cubre poco.
   * Caché TTL por (solicitud, fase, input): el auto-análisis con debounce
   * y los re-renders no repiten el recall contra ninguna base.
   */
  private readonly recallCache = new Map<string, { expires: number; result: any }>();
  private static readonly RECALL_TTL_MS = 60_000;
  private static readonly RECALL_CACHE_MAX = 200;
  private static readonly RECALL_LIKE_LIMIT = 100;
  private static readonly RECALL_BACKFILL_MIN = 3;
  private static readonly RECALL_BACKFILL_TOP = 50;
  private static readonly RECALL_HYDRATE_MAX = 20;
  private static readonly RECALL_SNAPSHOT_CAP = 300;

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
   * - `poolTotal/poolScanned/poolTruncated` hacen visible el universo
   *   evaluado: el recall corre sobre el espejo LOCAL completo (el tope
   *   de 500 por código se eliminó; `poolTruncated` solo salta si la red
   *   de seguridad de 20000 recortó);
   * - `recallSource` dice de dónde salió el recall (LOCAL / LOCAL+PROFIT
   *   / PROFIT) y la auditoría cuenta `filteredNoEvidence` (candidatos
   *   descartados por no tener evidencia demostrable: sin evidencia no
   *   hay coincidencia, no se lista relleno "0/100").
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
    const input = this.mergeDraftInput(base, draft, phase);
    return this.runAnalysis(requestId, input, {
      universeCompanyCode: universe.code,
      universeSource: universe.source,
      limit: opts.limit,
      actorId: opts.actorId,
      phase,
    });
  }

  /**
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
   * FASE P4 — UNA sola definición de "solicitud + borrador" para una fase:
   * el análisis del motor, las propuestas manuales y su re-puntaje se
   * miden con exactamente la misma regla. Si la fusión viviera en dos
   * lugares, una propuesta y un candidato del motor podrían estar
   * comparando cosas distintas.
   *
   * FASE P2 — fases:
   * - INICIAL: únicamente texto libre. Se descartan deliberadamente los
   *   campos guardados de la solicitud (marca, grupo, unidad, parte,
   *   aplicación): si viajaran, la "búsqueda por descripción" seguiría
   *   siendo una búsqueda por clasificación.
   * - COMPLETA: todos los campos (comparación definitiva).
   */
  private mergeDraftInput(
    base: ArticleMatchingInput,
    draft: AnalyzerDraftInput,
    phase: AnalyzerPhase,
  ): ArticleMatchingInput {
    return phase === 'INICIAL'
      ? {
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
    const company = (opts.universeCompanyCode ?? input.companyCode ?? '').trim().toUpperCase();
    const cacheKey = this.recallCacheKey(requestId, opts, company, input);
    const cached = this.readRecallCache(cacheKey);
    if (cached) return cached;

    // 1) Universo local COMPLETO (proyección lean): el recall ya no se
    //    corta en los primeros 500 perfiles por código — ese corte era lo
    //    que dejaba fuera coincidencias reales. No toca Profit.
    const pool = await this.repository.listRecallPool(company);
    const poolTotal = await this.poolTotal(company);
    // 2) Canal LIKE por palabras sobre el espejo local (literales:
    //    "vaso" → VASO/VASOS; misma tokenización que la búsqueda manual).
    const likeKeys = await this.likeRecallKeys(company, input.description);
    // 3) Prefiltrado con LA MISMA definición de similitud que el scoring
    //    (tolerantSimilarity ≥ umbral) + puertas ortogonales: LIKE local,
    //    campo fuerte y token técnico. Lo que entra aquí, el motor lo
    //    puntúa con evidencia; lo que no se parece, ni entra.
    let snapshots = this.preselect(input, v2, pool, likeKeys);
    let recallSource: 'LOCAL' | 'LOCAL+PROFIT' | 'PROFIT' = 'LOCAL';
    // 4) Respaldo en vivo SOLO cuando el local cubre poco: SELECT acotado
    //    ya existente + hidratación puntual y acotada. Profit sigue
    //    READ-ONLY; una fila que no hidrata no tumba el análisis.
    const detailOverlay = new Map<string, { description: string; detail: Record<string, any> }>();
    if (
      snapshots.length < MatchingService.RECALL_BACKFILL_MIN &&
      (input.description ?? '').trim() &&
      this.universe
    ) {
      const backfill = await this.backfillFromProfit(company, input.description!.trim());
      if (backfill.snapshots.length > 0) {
        const seen = new Set(
          snapshots.map((s) => `${s.article.companyCode}:${s.article.profitArticleCode}`),
        );
        for (const s of backfill.snapshots) {
          const k = `${s.article.companyCode}:${s.article.profitArticleCode}`;
          if (!seen.has(k)) {
            seen.add(k);
            snapshots.push(s);
          }
        }
        for (const p of backfill.profiles) {
          detailOverlay.set(`${p.companyCode}:${p.profitArticleCode}`, this.toDetailEntry(p));
        }
        recallSource = snapshots.length > backfill.snapshots.length ? 'LOCAL+PROFIT' : 'PROFIT';
      }
    }
    // Red de seguridad: el tope ya NO recorta el universo antes de
    // puntuar (antes cortaba alfabéticamente y podía esconder al mejor
    // candidato tras la letra 300). Ahora se puntúa todo lo preseleccionado
    // y solo se conservan los MEJORES 300 (orden del motor: score desc).
    const poolScanned = pool.length;
    const poolTruncated = typeof poolTotal === 'number' && poolTotal > poolScanned;
    const byKey = new Map(
      pool.map((p: Record<string, any>) => [
        `${p.companyCode}:${p.profitArticleCode}`,
        this.toDetailEntry(p),
      ]),
    );
    for (const [k, entry] of detailOverlay) byKey.set(k, entry);
    const preselected = snapshots;
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

    // Honestidad: sin evidencia no hay coincidencia. Lo que el motor
    // puntúa 0 y sin señales NO se lista — antes aparecía como relleno
    // "0/100" (FARO para "vaso") y ensuciaba la bandeja; ahora la UI
    // muestra su estado vacío: "No encontramos coincidencias relevantes".
    // Exención: lo vinculado o decidido SAME nunca se oculta: es una
    // relación humana ya registrada, aunque hoy puntúe 0.
    const beforeNoEvidenceFilter = candidates.length;
    candidates = candidates.filter((c) => {
      if (c.score > 0 || c.evidence.length > 0) return true;
      return sameKeys.has(`${c.article.companyCode}:${c.article.profitArticleCode}`);
    });
    const filteredNoEvidence = beforeNoEvidenceFilter - candidates.length;
    // Red de seguridad post-scoring: los mejores (no los primeros por
    // código) ante un caso patológico de miles de preseleccionados.
    candidates = candidates.slice(0, MatchingService.RECALL_SNAPSHOT_CAP);

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
        filteredNoEvidence,
        engineVersion: 'v1',
        phase: opts.phase ?? 'COMPLETA',
        universeCompanyCode: opts.universeCompanyCode,
        universeSource: opts.universeSource,
        recallSource,
        poolScanned,
        poolTruncated,
      }),
    });
    const out = {
      input,
      candidates: limited,
      insufficient: false as const,
      engineVersion: 'v1' as const,
      phase: (opts.phase ?? 'COMPLETA') as AnalyzerPhase,
      poolTotal,
      poolScanned,
      poolTruncated,
      recallSource,
    };
    this.writeRecallCache(cacheKey, out);
    return out;
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

  /** Clave del caché de recall: mismo input + empresa + fase + límite. */
  private recallCacheKey(
    requestId: string,
    opts: { limit?: number; actorId?: string; phase?: AnalyzerPhase },
    company: string,
    input: ArticleMatchingInput,
  ): string {
    return [
      requestId,
      opts.phase ?? 'COMPLETA',
      company,
      opts.limit ?? 'all',
      opts.actorId ?? '-',
      JSON.stringify(input),
    ].join('|');
  }

  private readRecallCache(key: string): any | null {
    const hit = this.recallCache.get(key);
    if (!hit) return null;
    if (hit.expires <= Date.now()) {
      this.recallCache.delete(key);
      return null;
    }
    return hit.result;
  }

  private writeRecallCache(key: string, result: any): void {
    if (this.recallCache.size >= MatchingService.RECALL_CACHE_MAX) {
      const oldest = this.recallCache.keys().next();
      if (!oldest.done) this.recallCache.delete(oldest.value);
    }
    this.recallCache.set(key, { expires: Date.now() + MatchingService.RECALL_TTL_MS, result });
  }

  private invalidateRecallCache(requestId: string): void {
    for (const key of this.recallCache.keys()) {
      if (key === requestId || key.startsWith(`${requestId}|`)) this.recallCache.delete(key);
    }
  }

  /**
   * Canal LIKE por palabras sobre el espejo local: devuelve las claves
   * `company:code` que contienen todos los tokens (subcadena, cualquier
   * orden). Es el canal literal del recall multicanal; la misma
   * tokenización que la búsqueda manual. Nunca tumba el análisis.
   */
  private async likeRecallKeys(company: string, description?: string): Promise<Set<string>> {
    const q = (description ?? '').trim();
    if (!company || !q || typeof this.repository.searchProfiles !== 'function') return new Set();
    try {
      const hits = await this.repository.searchProfiles(
        company, q, MatchingService.RECALL_LIKE_LIMIT,
      );
      return new Set(hits.map((h: any) => `${h.companyCode}:${h.profitArticleCode}`));
    } catch {
      return new Set();
    }
  }

  /**
   * Respaldo en vivo a Profit cuando el espejo local cubre poco: usa el
   * SELECT dirigido ya existente (`searchArticles`, TOP acotado,
   * parametrizado) e hidrata cada fila a perfil local (idempotente).
   * Acotado a RECALL_HYDRATE_MAX hidrataciones; una fila que no hidrata
   * se salta sin tumbar el análisis. Profit sigue READ-ONLY.
   */
  private async backfillFromProfit(
    company: string, description: string,
  ): Promise<{ snapshots: ArticleSnapshot[]; profiles: any[] }> {
    const empty = { snapshots: [] as ArticleSnapshot[], profiles: [] as any[] };
    if (!this.universe) return empty;
    let rows: Array<{ co_art: string; art_des: string }> = [];
    try {
      rows = await this.universe.searchArticles(
        company, description, MatchingService.RECALL_BACKFILL_TOP,
      );
    } catch {
      return empty;
    }
    const snapshots: ArticleSnapshot[] = [];
    const profiles: any[] = [];
    for (const row of rows.slice(0, MatchingService.RECALL_HYDRATE_MAX)) {
      const code = (row.co_art ?? '').trim();
      if (!code) continue;
      try {
        const p = await this.getOrCreateProfile(company, code);
        profiles.push(p);
        snapshots.push({
          article: { companyCode: company, profitArticleCode: code },
          description: String(p.normalizedDescription ?? p.originalDescription ?? ''),
          brand: p.brand ?? undefined,
          model: p.model ?? undefined,
          partNumber: p.partNumber ?? undefined,
          category: p.category ?? undefined,
          subCategory: p.subCategory ?? undefined,
          unit: p.unit ?? undefined,
          application: p.application ?? undefined,
        });
      } catch {
        continue;
      }
    }
    return { snapshots, profiles };
  }

  /** Entrada de detalle para la UI a partir de una fila de perfil. */
  private toDetailEntry(p: Record<string, any>): { description: string; detail: Record<string, any> } {
    return {
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
    };
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
    // El vínculo cambia lo que un próximo análisis debe mostrar para esta
    // solicitud: se invalida su caché de recall (TTL aparte, frescura ya).
    this.invalidateRecallCache(requestId);
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
   * FASE P4 — Snapshot del motor a partir de una fila de perfil (misma
   * forma que usa preselect/backfill: comparación real, nada inventado).
   */
  private profileSnapshot(p: Record<string, any>): ArticleSnapshot {
    return {
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
  }

  /**
   * FASE P4 — "Agregar a coincidencias": promueve un hallazgo de la búsqueda
   * manual a propuesta persistida del usuario para esta solicitud.
   *
   * No decide nada (ni SAME ni workflow) y no escribe en Profit:
   *  1) valida el artículo contra el MISMO universo que usó la búsqueda;
   *  2) asegura el perfil con el get-or-create idempotente (si el espejo no
   *     lo tiene, un SELECT a Profit lo hidrata — Profit READ-ONLY — y si
   *     Profit no lo conoce → 404);
   *  3) puntúa con el MISMO motor del análisis (`comparePair`) contra la
   *     solicitud + borrador en la fase indicada: score y evidencia reales;
   *  4) persiste la tripleta como PROPUESTA (nunca pisa SAME/DIFFERENT ya
   *     registrados: esas decisiones humanas no se degradan) y audita.
   */
  async proposeManualCandidate(
    requestId: string,
    companyCode: string,
    profitArticleCode: string,
    draft: AnalyzerDraftInput,
    opts: { phase?: AnalyzerPhase; actorId?: string } = {},
  ): Promise<ManualProposalCandidate> {
    const company = (companyCode ?? '').trim().toUpperCase();
    const code = (profitArticleCode ?? '').trim();
    if (!company || !code) {
      throw new BadRequestException('La empresa y el código del artículo son requeridos.');
    }
    const base = await this.buildInputFromRequest(requestId);
    const universe = await this.resolveUniverseCompany(base.companyCode);
    if (company !== universe.code) {
      throw new BadRequestException(
        `El artículo ${company}:${code} queda fuera del universo de esta solicitud (${universe.code}).`,
      );
    }
    const profile = await this.getOrCreateProfile(company, code);
    const history =
      typeof this.repository.listRequestDecisions === 'function'
        ? await this.repository.listRequestDecisions(requestId)
        : [];
    const existing = history.find(
      (d) => d.companyCode === company && d.profitArticleCode === code,
    );
    if (existing && existing.decision !== REQUEST_PROPOSAL_DECISION) {
      throw new BadRequestException('Este artículo ya tiene una decisión registrada para esta solicitud.');
    }
    const input = this.mergeDraftInput(base, draft, opts.phase ?? 'COMPLETA');
    const candidate = comparePair(input, this.profileSnapshot(profile));
    if (!candidate) {
      throw new BadRequestException('No se puede proponer el propio artículo de la solicitud.');
    }
    const info = this.toDetailEntry(profile);
    if (typeof this.repository.upsertRequestDecision === 'function') {
      await this.repository.upsertRequestDecision({
        requestId,
        companyCode: company,
        profitArticleCode: code,
        decision: REQUEST_PROPOSAL_DECISION,
        decidedBy: opts.actorId ?? null,
      });
    }
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      requestId,
      actorId: opts.actorId,
      entityType: 'RequestArticleDecision',
      entityId: `${requestId}:${company}:${code}`,
      action: 'MATCH_MANUAL_PROPOSED',
      afterData: JSON.stringify({
        companyCode: company,
        profitArticleCode: code,
        score: candidate.score,
        classification: candidate.classification,
        phase: opts.phase ?? 'COMPLETA',
      }),
    });
    return { ...candidate, description: info.description, detail: info.detail, manual: true };
  }

  /**
   * FASE P4 — propuestas manuales guardadas de la solicitud, re-puntadas
   * contra la solicitud + borrador ACTUALES con el mismo motor y la MISMA
   * fase que el análisis: el número que ve el usuario para una propuesta se
   * calcula con la misma regla que el de un candidato del motor.
   *
   * Sin auditoría por consulta: el evento quedó registrado al proponer
   * (evita ruido en la auditoría en cada montaje del panel). Solo lectura.
   */
  async listManualProposals(
    requestId: string,
    draft: AnalyzerDraftInput,
    opts: { phase?: AnalyzerPhase } = {},
  ): Promise<{ candidates: ManualProposalCandidate[] }> {
    const base = await this.buildInputFromRequest(requestId);
    const history =
      typeof this.repository.listRequestDecisions === 'function'
        ? await this.repository.listRequestDecisions(requestId)
        : [];
    const proposals = history.filter((d) => d.decision === REQUEST_PROPOSAL_DECISION);
    if (proposals.length === 0) return { candidates: [] };
    const input = this.mergeDraftInput(base, draft, opts.phase ?? 'COMPLETA');
    const candidates: ManualProposalCandidate[] = [];
    for (const p of proposals) {
      let profile = await this.repository.findProfile(p.companyCode, p.profitArticleCode);
      if (!profile) {
        // El espejo pudo reiniciarse entre propuesta y consulta: se rehidrata
        // con el mismo get-or-create idempotente; si Profit ya no lo conoce,
        // se omite sin tumbar la lista.
        try {
          profile = await this.getOrCreateProfile(p.companyCode, p.profitArticleCode);
        } catch {
          continue;
        }
      }
      const compared = comparePair(input, this.profileSnapshot(profile));
      if (!compared) continue;
      const info = this.toDetailEntry(profile);
      candidates.push({ ...compared, description: info.description, detail: info.detail, manual: true });
    }
    return { candidates };
  }

  /**
   * FASE P4 — retira una propuesta manual. Borra SOLO la fila PROPUESTA de
   * esa tripleta (nunca SAME/DIFFERENT registrados) y es idempotente:
   * `removed: 0` significa que ya no estaba.
   */
  async unproposeManualCandidate(
    requestId: string,
    companyCode: string,
    profitArticleCode: string,
    actorId: string,
  ): Promise<{ removed: number }> {
    const company = (companyCode ?? '').trim().toUpperCase();
    const code = (profitArticleCode ?? '').trim();
    if (!company || !code) {
      throw new BadRequestException('La empresa y el código del artículo son requeridos.');
    }
    const removed =
      typeof this.repository.deleteRequestDecision === 'function'
        ? (
            await this.repository.deleteRequestDecision({
              requestId,
              companyCode: company,
              profitArticleCode: code,
              decision: REQUEST_PROPOSAL_DECISION,
            })
          ).count
        : 0;
    if (removed > 0) {
      await this.auditoria.logEvent({
        correlationId: randomUUID(),
        requestId,
        actorId,
        entityType: 'RequestArticleDecision',
        entityId: `${requestId}:${company}:${code}`,
        action: 'MATCH_MANUAL_UNPROPOSED',
        afterData: JSON.stringify({ companyCode: company, profitArticleCode: code }),
      });
    }
    return { removed };
  }

  /**
   * Preselección sobre el universo local: UNA sola definición de
   * "parecerse", la misma que usa el scoring (`tolerantSimilarity ≥
   * MATCH_TUNING.description.minSimilarity`). Si esta puerta deja pasar
   * un artículo, `compareSignals` lo verá con los mismos ojos y le dará
   * evidencia real (DESCRIPTION_SIMILARITY); si no se parece ni así, no
   * entra (adiós al relleno "0/100"). Además de la similitud textual,
   * abre tres puertas ortogonales que el motor también entiende:
   *  - canal LIKE del espejo local (la consulta literal ya lo marcó);
   *  - campo fuerte normalizado (marca/modelo/parte en común);
   *  - token técnico compartido (featuresJson v2: número/modelo).
   *
   * FASE P1 — `v2.brandCandidate` es un NOMBRE normalizado (catálogo de
   * marcas) mientras `p.brand` guarda `art.co_color`, un CÓDIGO: compararlos
   * hacía que la preselección por marca nunca coincidiera. Ahora la marca se
   * compara con `input.brand` (código elegido en Almacén), mismo dominio.
   */
  private preselect(
    input: ArticleMatchingInput,
    v2: NormalizedProfileV2,
    profiles: Array<Record<string, any>>,
    likeKeys: Set<string> = new Set(),
  ): ArticleSnapshot[] {
    const tech = new Set(v2.technicalTokens);
    // Mismos tokens que luego calcula el motor para la pareja: si el
    // recall y el scoring no midieran con la misma regla, volveríamos al
    // bug de puertas incoherentes (entraba por una puerta, puntuaba 0).
    const queryTokens = descriptionTokens(input.description);
    const minSimilarity = MATCH_TUNING.description.minSimilarity;
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
      // Canal LIKE: el espejo local ya dijo que contiene todas las palabras.
      if (likeKeys.has(`${p.companyCode}:${p.profitArticleCode}`)) {
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
        ...descriptionTokens(p.normalizedDescription ?? p.originalDescription ?? ''),
      ]);
      let sharedTech = 0;
      for (const t of tech) {
        if (pTech.has(t)) sharedTech += 1;
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
      const profileTokens = descriptionTokens(snapshot.description);
      if (
        sharedTech >= 1 ||
        strongField ||
        tolerantSimilarity(queryTokens, profileTokens) >= minSimilarity
      ) {
        out.push(snapshot);
      }
    }
    return out;
  }
}
