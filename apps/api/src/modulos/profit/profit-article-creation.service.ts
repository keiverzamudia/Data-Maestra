import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
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
  outcome: 'INSERTED' | 'COLLISION' | 'ERROR';
  errorCode?: string | number;
}

export interface CreationResult {
  ok: boolean;
  coArt: string;
  attempts: AllocationAttempt[];
  reconcile: ReconcileStatus;
  differences: string[];
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
  constructor(
    private readonly writeAdapter: ProfitWriteAdapterService,
    private readonly readAdapter: ProfitAdapterService,
  ) {}

  /** Plan sin escritura: payload + candidato + disponibilidad (§22).
   *  Solo usa el adapter de LECTURA: funciona con el flag en false. */
  async plan(input: ProfitArticleInput): Promise<CreationPlan> {
    const prefix = profitCodePrefix(input.groupCode, input.subgroupCode);
    if (!prefix) throw new BadRequestException('Grupo y subgrupo son requeridos para generar co_art');
    const maxSeq = await this.readAdapter.maxSequenceFor(prefix);
    const nextSequence = maxSeq + 1;
    if (nextSequence > MAX_SEQUENCE_PER_PAIR) {
      throw new BadRequestException('ERROR_CODE_SPACE_EXHAUSTED: sin correlativo disponible para esta línea/sublinea');
    }
    const candidate = profitCandidate(prefix, nextSequence);
    const payload = buildProfitArticlePayload(candidate, input);
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

    const startSeq = (await this.writeAdapter.maxSequenceFor(prefix)) + 1;
    const attempts: AllocationAttempt[] = [];
    let seq = startSeq;

    for (let attempt = 1; attempt <= MAX_CODE_ALLOCATION_ATTEMPTS; attempt++) {
      if (seq > MAX_SEQUENCE_PER_PAIR) {
        return this.exhausted(attempts, prefix);
      }
      const candidate = profitCandidate(prefix, seq);
      const existedBefore = await this.writeAdapter.articleExists(candidate);
      if (existedBefore) {
        attempts.push({ attempt, candidate, existedBefore: true, outcome: 'COLLISION' });
        seq++;
        continue;
      }
      const payload = buildProfitArticlePayload(candidate, input);
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

  /** Relectura y comparación EXPECTED vs ACTUAL (§17-§18). */
  async verifyAndReconcile(
    coArt: string,
    expected: ProfitArticlePayload,
  ): Promise<{ status: ReconcileStatus; differences: string[] }> {
    let actual: ProfitArticlePayload | null;
    try {
      actual = await this.writeAdapter.readArticle(coArt);
    } catch {
      return { status: 'RECONCILIATION_ERROR', differences: ['relectura no disponible'] };
    }
    if (!actual) return { status: 'NOT_FOUND', differences: [] };
    const fields: Array<keyof ProfitArticlePayload> = [
      'co_art', 'art_des', 'tipo', 'co_lin', 'co_subl', 'uni_venta', 'suni_venta',
      'tipo_imp', 'co_cat', 'co_color', 'procedenci', 'co_prov', 'tipo_cos',
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

  /** Estado de escritura para la UI (solo lectura, nunca habilita nada). */
  writeStatus(): { enabled: boolean; configured: boolean } {
    const enabled = this.writeAdapter.isWriteEnabled();
    let configured = false;
    try {
      this.writeAdapter.describeTarget();
      configured = true;
    } catch {
      configured = false;
    }
    return { enabled, configured };
  }
}
