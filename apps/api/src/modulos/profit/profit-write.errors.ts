/**
 * Clasificación exacta de errores SQL Server para el motor de creación
 * (FASE 14D §6-§7 / 14E §11). Solo es colisión 2627 + PK art_co_art.
 * 2601 NO es criterio de colisión. Timeouts/pérdidas de conexión son
 * ambiguos y exigen VERIFY, nunca retry ciego.
 */

export type ProfitWriteErrorKind =
  | 'DUPLICATE_CODE'
  | 'FK_VIOLATION'
  | 'CHECK_VIOLATION'
  | 'TRIGGER_REJECT'
  | 'TIMEOUT'
  | 'CONNECTION_LOST'
  | 'WRITE_DISABLED'
  | 'WRITE_NOT_CONFIGURED'
  | 'PROFIT_UNAVAILABLE'
  | 'UNKNOWN';

export interface ClassifiedProfitError {
  kind: ProfitWriteErrorKind;
  /** true solo para DUPLICATE_CODE: único caso con reintento automático. */
  retryableAsCollision: boolean;
  /** true para TIMEOUT/CONNECTION_LOST: exigen VERIFY antes de continuar. */
  needsVerify: boolean;
  code?: string | number;
  message: string;
}

interface SqlErrorLike {
  number?: number;
  code?: string | number;
  message?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function classifyProfitWriteError(err: any): ClassifiedProfitError {
  const e: SqlErrorLike = err ?? {};
  const num = typeof e.number === 'number' ? e.number : undefined;
  const message = String(e.message ?? err ?? 'Unknown error');

  // Colisión: EXCLUSIVAMENTE 2627 sobre la PK art_co_art (14D §7).
  if (num === 2627 && /art_co_art/i.test(message)) {
    return { kind: 'DUPLICATE_CODE', retryableAsCollision: true, needsVerify: false, code: num, message };
  }
  // 2627 sobre otra restricción (p. ej. rowguid, imposible en la práctica):
  // error real, no colisión de código.
  if (num === 2627) {
    return { kind: 'UNKNOWN', retryableAsCollision: false, needsVerify: false, code: num, message };
  }
  // 2601 (índice único): solo colisión si menciona co_art/art_co_art
  // (14D: el otro único, rowguid, es autogenerado; 14F §36: mapear colisión
  // de código cuando corresponde inequívocamente a co_art).
  if (num === 2601) {
    if (/art_co_art|co_art/i.test(message)) {
      return { kind: 'DUPLICATE_CODE', retryableAsCollision: true, needsVerify: false, code: num, message };
    }
    return { kind: 'UNKNOWN', retryableAsCollision: false, needsVerify: false, code: num, message };
  }
  // FK y CHECK son 547 en SQL Server; se distinguen por el texto.
  if (num === 547) {
    if (/CHECK constraint/i.test(message)) {
      return { kind: 'CHECK_VIOLATION', retryableAsCollision: false, needsVerify: false, code: num, message };
    }
    return { kind: 'FK_VIOLATION', retryableAsCollision: false, needsVerify: false, code: num, message };
  }
  // Trigger RAISERROR personalizado.
  if (num === 50000) {
    return { kind: 'TRIGGER_REJECT', retryableAsCollision: false, needsVerify: false, code: num, message };
  }
  // Timeout / conexión: ambiguos → VERIFY.
  if (num === -2 || e.code === 'ETIMEOUT' || e.code === 'EREQUEST' || /timeout/i.test(message)) {
    return { kind: 'TIMEOUT', retryableAsCollision: false, needsVerify: true, code: e.code ?? num, message };
  }
  if (e.code === 'ESOCKET' || e.code === 'ECONNRESET' || e.code === 'ECONNCLOSED' || /connection (lost|closed|reset)|socket hang up/i.test(message)) {
    return { kind: 'CONNECTION_LOST', retryableAsCollision: false, needsVerify: true, code: e.code, message };
  }
  return { kind: 'UNKNOWN', retryableAsCollision: false, needsVerify: false, code: e.code ?? num, message };
}
