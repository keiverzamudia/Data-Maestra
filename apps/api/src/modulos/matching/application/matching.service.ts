import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
  partNumber?: string;
  application?: string;
}
import { assessCoverage, buildFingerprint } from '../domain/historical-coverage';
import { DeterministicMatchEngineV1 } from '../domain/match-engine';
import type { ArticleSnapshot } from '../domain/match-engine';
import { normalizeTextV2 } from '../domain/text-normalizer';
import { MatchingRepository } from '../infrastructure/matching.repository';

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
      // manufacturer como respaldo. RequestData no tiene model dedicado
      // (se documenta como extensión futura, sin inventar datos).
      brand: rd?.brandCode ?? rd?.manufacturer ?? undefined,
      model: rd?.manufacturer && rd?.brandCode ? rd.manufacturer : undefined,
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
  async findCandidatesForRequest(requestId: string, companyCodeOverride?: string) {
    const input = await this.buildInputFromRequest(requestId, companyCodeOverride);
    if (!input.description || !input.description.trim()) {
      throw new BadRequestException('No fue posible procesar la información.');
    }
    return this.runAnalysis(requestId, input, {});
  }

  /**
   * FASE 23.1 — Analizador de Almacén: misma tubería que
   * findCandidatesForRequest pero con borrador del formulario (datos aún no
   * guardados) y universo acotado a una compañía (AD_TRANS por defecto).
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
   */
  async analyzeDraft(
    requestId: string,
    draft: AnalyzerDraftInput,
    opts: { universeCompanyCode?: string; limit?: number } = {},
  ) {
    const universe = (opts.universeCompanyCode ?? 'AD_TRANS').trim().toUpperCase();
    if (!/^[A-Z0-9_]{1,30}$/.test(universe)) {
      throw new BadRequestException('La empresa del universo no es válida.');
    }
    const base = await this.buildInputFromRequest(requestId);
    const input: ArticleMatchingInput = {
      ...base,
      description: draft.description ?? base.description,
      purpose: draft.purpose ?? base.purpose,
      brand: draft.brandCode ?? base.brand,
      partNumber: draft.partNumber ?? base.partNumber,
      category: draft.groupCode ?? base.category,
      subCategory: draft.subgroupCode ?? base.subCategory,
      unit: draft.unitCode ?? base.unit,
      application: draft.application ?? base.application,
    };
    return this.runAnalysis(requestId, input, {
      universeCompanyCode: universe,
      limit: opts.limit,
    });
  }

  private async runAnalysis(
    requestId: string,
    input: ArticleMatchingInput,
    opts: { universeCompanyCode?: string; limit?: number },
  ) {
    const v2 = await this.normalizeV2Safe(input);
    if (!v2 || this.isInsufficient(input, v2)) {
      await this.auditoria.logEvent({
        correlationId: randomUUID(),
        requestId,
        actorId: undefined,
        entityType: 'MatchQuery',
        entityId: requestId,
        action: 'MATCH_CANDIDATES_CONSULTED',
        afterData: JSON.stringify({ count: 0, insufficient: true, engineVersion: 'v1' }),
      });
      return { input, candidates: [], insufficient: true as const, engineVersion: 'v1' as const };
    }
    const profiles = await this.repository.listProfiles(500, opts.universeCompanyCode);
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
    const preselected = this.preselect(v2, profiles);
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
      actorId: undefined,
      entityType: 'MatchQuery',
      entityId: requestId,
      action: 'MATCH_CANDIDATES_CONSULTED',
      afterData: JSON.stringify({ count: limited.length, engineVersion: 'v1' }),
    });
    return { input, candidates: limited, insufficient: false as const, engineVersion: 'v1' as const };
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
   */
  private preselect(v2: NormalizedProfileV2, profiles: Array<Record<string, any>>): ArticleSnapshot[] {
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
        (v2.brandCandidate && normEq(v2.brandCandidate, p.brand)) ||
        (v2.modelCandidate && normEq(v2.modelCandidate, p.model)) ||
        (v2.partNumberCandidate && normEq(v2.partNumberCandidate, p.partNumber));
      if (sharedTech >= 1 || shared >= 2 || strongField) {
        out.push(snapshot);
      }
    }
    return out;
  }
}
