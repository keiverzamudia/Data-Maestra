import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MAX_CODE_ALLOCATION_ATTEMPTS,
  MAX_SEQUENCE_PER_PAIR,
  buildProfitArticlePayload,
  profitCandidate,
  profitCodePrefix,
  type ProfitArticleInput,
  type ProfitArticlePayload,
} from './profit-article.payload';
import { classifyProfitWriteError, type ClassifiedProfitError } from './profit-write.errors';
import { ProfitWriteAdapterService } from './profit-write.adapter';
import { ProfitAdapterService } from './profit-adapter.service';

export type ReconcileStatus =
  | 'CREATED_AND_VERIFIED'
  | 'CREATED_WITH_DIFFERENCES'
  | 'NOT_FOUND'
  | 'RECONCILIATION_ERROR';

export interface AllocationAttempt {
  attempt: number;
  candidate: string;
  existedBefore: boolean;
  outcome: 'INSERTED' | 'COLLISION' | 'ERROR' | 'ALREADY_REGISTERED';
  errorCode?: string | number;
}

export interface CreationResult {
  ok: boolean;
  coArt: string;
  attempts: AllocationAttempt[];
  reconcile: ReconcileStatus;
  differences: string[];
  /** true cuando el artículo ya existía con nuestros datos (sin INSERT). */
  alreadyRegistered?: boolean;
  /** ERROR_CODE_ALLOCATION_EXHAUSTED u otro código final. */
  errorCode?: string;
  errorDetail?: string;
}

export interface CreationPlan {
  payload: ProfitArticlePayload;
  candidate: string;
  available: boolean;
  nextSequence: number;
  warnings: string[];
}

/**
 * Motor de creación de artículos en Profit (FASE 14E). NO ejecuta nada por sí
 * solo: la orquestación (gates, estados, auditoría) vive en SolicitudesService.
 * El INSERT es la autoridad final; el existence check es solo filtro (§10).
 */
@Injectable()
export class ProfitArticleCreationService {
  private readonly logger = new Logger(ProfitArticleCreationService.name);

  constructor(
    private readonly writeAdapter: ProfitWriteAdapterService,
    private readonly readAdapter: ProfitAdapterService,
    // Opcional al final por compatibilidad posicional en tests. Tipado como
    // ConfigService (inyectable global) y NO como interfaz inline: un tipo
    // objeto emite metadata `Object` y rompe el DI de Nest al arrancar.
    private readonly configService?: ConfigService,
  ) {}

  /**
   * Código del usuario de integración Profit (p. ej. DM). Backend-only:
   * ClassifyRequestDto no tiene este campo y buildProfitInput jamás lo lee
   * de la solicitud. Vacío o mal formado = preflight fallido, sin escritura.
   */
  integrationUserCode(): string {
    const raw = this.configService?.get('PROFIT_INTEGRATION_USER_CODE') ?? '';
    const code = String(raw).trim();
    if (!/^[A-Za-z0-9]{1,6}$/.test(code)) {
      // Solo presencia en el log (el código funcional no es secreto, pero el
      // mensaje debe permitir diagnosticar un 400 sin exponer configuración).
      this.logger.warn('PROFIT_INTEGRATION_USER_CODE ausente o inválido: preflight de integración bloqueado');
      throw new BadRequestException('Usuario de integración de Profit no configurado o inexistente.');
    }
    return code;
  }

  /** Plan sin escritura: payload + candidato + disponibilidad (§22).
   *  Solo usa el adapter de LECTURA: funciona con el flag en false. */
  async plan(input: ProfitArticleInput): Promise<CreationPlan> {
    const prefix = profitCodePrefix(input.groupCode, input.subgroupCode);
    if (!prefix) throw new BadRequestException('Grupo y subgrupo son requeridos para generar co_art');
    const withUser = { ...input, integrationUser: this.integrationUserCode() };
    const maxSeq = await this.readAdapter.maxSequenceFor(prefix);
    const nextSequence = maxSeq + 1;
    if (nextSequence > MAX_SEQUENCE_PER_PAIR) {
      throw new BadRequestException('ERROR_CODE_SPACE_EXHAUSTED: sin correlativo disponible para esta línea/sublinea');
    }
    const candidate = profitCandidate(prefix, nextSequence);
    const payload = buildProfitArticlePayload(candidate, withUser);
    const available = !(await this.readAdapter.articleExists(candidate));
    const warnings: string[] = [];
    if (!available) warnings.push(`Candidato ocupado: ${candidate} (el motor avanzará al siguiente)`);
    return { payload, candidate, available, nextSequence, warnings };
  }

  /**
   * Asigna código e inserta con reintento limitado (§12). Solo reintenta
   * colisiones 2627+art_co_art. Errores ambiguos de red → VERIFY primero (§16).
   */
  async allocateAndInsert(input: ProfitArticleInput): Promise<CreationResult> {
    const prefix = profitCodePrefix(input.groupCode, input.subgroupCode);
    if (!prefix) throw new BadRequestException('Grupo y subgrupo son requeridos para generar co_art');
    // Preflight de integración: sin usuario configurado no hay escritura.
    const withUser = { ...input, integrationUser: this.integrationUserCode() };

    const startSeq = (await this.writeAdapter.maxSequenceFor(prefix)) + 1;
    const attempts: AllocationAttempt[] = [];
    let seq = startSeq;

    for (let attempt = 1; attempt <= MAX_CODE_ALLOCATION_ATTEMPTS; attempt++) {
      if (seq > MAX_SEQUENCE_PER_PAIR) {
        return this.exhausted(attempts, prefix);
      }
      const candidate = profitCandidate(prefix, seq);
      const payload = buildProfitArticlePayload(candidate, withUser);
      const existedBefore = await this.writeAdapter.articleExists(candidate);
      if (existedBefore) {
        // Idempotencia (14K.5): si es NUESTRO artículo ya registrado, éxito
        // sin duplicar; si es ajeno, se avanza como colisión evitada.
        const v = await this.verifyAndReconcile(candidate, payload);
        if (v.status === 'CREATED_AND_VERIFIED') {
          attempts.push({ attempt, candidate, existedBefore: true, outcome: 'ALREADY_REGISTERED' });
          return { ok: true, coArt: candidate, attempts, reconcile: v.status, differences: v.differences, alreadyRegistered: true };
        }
        attempts.push({ attempt, candidate, existedBefore: true, outcome: 'COLLISION' });
        seq++;
        continue;
      }
      try {
        await this.writeAdapter.insertArticle(payload);
        attempts.push({ attempt, candidate, existedBefore: false, outcome: 'INSERTED' });
        const v = await this.verifyAndReconcile(candidate, payload);
        return { ok: v.status === 'CREATED_AND_VERIFIED', coArt: candidate, attempts, reconcile: v.status, differences: v.differences };
      } catch (err) {
        const c: ClassifiedProfitError = classifyProfitWriteError(err);
        if (c.retryableAsCollision) {
          attempts.push({ attempt, candidate, existedBefore: false, outcome: 'COLLISION', errorCode: c.code });
          seq++;
          continue;
        }
        if (c.needsVerify) {
          // §16: ambiguo → VERIFY antes de decidir; si otro proceso lo creó
          // con nuestros datos, reconciliar; si no existe, ERROR (no retry ciego).
          const v = await this.verifyAndReconcile(candidate, payload);
          if (v.status === 'CREATED_AND_VERIFIED') {
            attempts.push({ attempt, candidate, existedBefore: false, outcome: 'INSERTED' });
            return { ok: true, coArt: candidate, attempts, reconcile: v.status, differences: v.differences };
          }
          attempts.push({ attempt, candidate, existedBefore: false, outcome: 'ERROR', errorCode: c.code });
          return {
            ok: false, coArt: candidate, attempts, reconcile: v.status, differences: v.differences,
            errorCode: 'ERROR_PROFIT_AMBIGUOUS', errorDetail: c.message,
          };
        }
        attempts.push({ attempt, candidate, existedBefore: false, outcome: 'ERROR', errorCode: c.code });
        return {
          ok: false, coArt: candidate, attempts, reconcile: 'RECONCILIATION_ERROR', differences: [],
          errorCode: `ERROR_PROFIT_${c.kind}`, errorDetail: this.safeDetail(c.message),
        };
      }
    }
    return this.exhausted(attempts, prefix);
  }

  private exhausted(attempts: AllocationAttempt[], prefix: string): CreationResult {
    const last = attempts.length > 0 ? attempts[attempts.length - 1] : undefined;
    return {
      ok: false,
      coArt: last?.candidate ?? profitCandidate(prefix, 1),
      attempts,
      reconcile: 'NOT_FOUND',
      differences: [],
      errorCode: 'ERROR_CODE_ALLOCATION_EXHAUSTED',
      errorDetail: `Agotados ${MAX_CODE_ALLOCATION_ATTEMPTS} intentos para prefijo ${prefix}`,
    };
  }

  /** Relectura y comparación EXPECTED vs ACTUAL (§17-§18).
   *  Lee por el adapter READ (misma base/destino): verificar no exige flag
   *  (14K.0); el flag gobierna únicamente el INSERT. */
  async verifyAndReconcile(
    coArt: string,
    expected: ProfitArticlePayload,
  ): Promise<{ status: ReconcileStatus; differences: string[] }> {
    let actual: ProfitArticlePayload | null;
    try {
      actual = (await this.readAdapter.getArticleForVerify(coArt)) as ProfitArticlePayload | null;
    } catch {
      return { status: 'RECONCILIATION_ERROR', differences: ['relectura no disponible'] };
    }
    if (!actual) return { status: 'NOT_FOUND', differences: [] };
    const fields: Array<keyof ProfitArticlePayload> = [
      'co_art', 'art_des', 'tipo', 'co_lin', 'co_subl', 'uni_venta', 'suni_venta',
      'tipo_imp', 'co_cat', 'co_color', 'procedenci', 'co_prov', 'tipo_cos',
      'co_us_in', 'co_sucu', 'uni_compra', 'modelo', 'ref',
    ];
    const differences: string[] = [];
    for (const f of fields) {
      if ((actual[f] ?? '') !== (expected[f] ?? '')) differences.push(f);
    }
    // dis_cen: Profit puede normalizar texto; diferencia solo si ambos no vacíos y distintos.
    if ((actual.dis_cen ?? '') !== (expected.dis_cen ?? '') && (actual.dis_cen ?? '').trim() && (expected.dis_cen ?? '').trim()) {
      differences.push('dis_cen');
    }
    if (differences.length === 0) return { status: 'CREATED_AND_VERIFIED', differences };
    // Fila ajena: el co_art existe pero no son nuestros datos → no reclamar.
    if (actual.art_des !== expected.art_des || actual.co_lin !== expected.co_lin) {
      return { status: 'RECONCILIATION_ERROR', differences };
    }
    return { status: 'CREATED_WITH_DIFFERENCES', differences };
  }

  /** Sin secretos en detalles de error (nunca connection strings). */
  private safeDetail(message: string): string {
    return message
      .replace(/password\s*=\s*[^; ]+/gi, 'password=***')
      .replace(/Server\s+[A-Za-z0-9_.-]+/gi, 'Server=***')
      .slice(0, 500);
  }

  assertAvailable(): void {
    if (!this.writeAdapter.isWriteEnabled()) {
      throw new ServiceUnavailableException('Profit write disabled (PROFIT_WRITE_ENABLED=false)');
    }
    this.writeAdapter.describeTarget();
  }

  /** Estado del motor para la UI (solo lectura, nunca habilita nada).
   *  CONFIGURADO = destino+modo presentes; CONECTADO = conexión real abierta
   *  con SELECT de identidad (§8: jamás afirmar conexión por configuración). */
  async writeStatus(): Promise<{
    enabled: boolean; configured: boolean; server?: string; database?: string;
    auth: 'windows' | 'sql'; connected: boolean; identity?: string; code?: string;
  }> {
    const enabled = this.writeAdapter.isWriteEnabled();
    const auth = this.writeAdapter.authMode();
    let server: string | undefined;
    let database: string | undefined;
    try {
      const t = this.writeAdapter.describeTarget();
      server = t.server;
      database = t.database;
    } catch {
      return { enabled, configured: false, auth, connected: false, code: 'NOT_CONFIGURED' };
    }
    const test = await this.writeAdapter.testConnection();
    return {
      enabled, configured: true, server, database, auth,
      connected: test.connected, identity: test.identity, code: test.code,
    };
  }
}
