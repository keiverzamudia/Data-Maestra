import { api } from './api-client';

export interface ProfitPayload {
  co_art: string;
  art_des: string;
  tipo: string;
  co_lin: string;
  co_subl: string;
  uni_venta: string;
  suni_venta: string;
  tipo_imp: string;
  co_cat: string;
  co_color: string;
  procedenci: string;
  co_prov: string;
  tipo_cos: string;
  dis_cen: string;
}

export interface ProfitPlan {
  requestId: string;
  payload: ProfitPayload;
  candidate: string;
  available: boolean;
  nextSequence: number;
  warnings: string[];
}

export interface ProfitAttempt {
  attempt: number;
  candidate: string;
  existedBefore: boolean;
  outcome: 'INSERTED' | 'COLLISION' | 'ERROR';
  errorCode?: string | number;
}

export type ReconcileStatus =
  | 'CREATED_AND_VERIFIED'
  | 'CREATED_WITH_DIFFERENCES'
  | 'NOT_FOUND'
  | 'RECONCILIATION_ERROR';

export interface ProfitCreationResult {
  requestId: string;
  correlationId?: string;
  ok: boolean;
  coArt: string;
  attempts: ProfitAttempt[];
  reconcile: ReconcileStatus;
  differences: string[];
  errorCode?: string;
  errorDetail?: string;
}

export interface ProfitVerifyResult {
  requestId: string;
  coArt: string;
  reconcile: ReconcileStatus;
  differences: string[];
}

export interface ProfitAttemptRecord {
  attempt: number;
  correlationId: string;
  createdAt: string;
  actorId: string | null;
  masterCode: string | null;
  coArt: string | null;
  result: 'SUCCESS' | 'FAILED' | 'UNKNOWN';
  reconcile: string | null;
  errorCode: string | null;
  durationMs: number | null;
  collisions: string[];
}

export interface ProfitRetryResult {
  requestId: string;
  correlationId: string;
  ready: boolean;
  candidate: string;
  available: boolean;
  payload: ProfitPayload;
  warnings: string[];
}

/** Estado operativo del módulo (14K.5, solo presentación). */
export type ProfitOpState =
  | 'DISABLED' | 'READY' | 'VALIDATING' | 'READY_TO_WRITE' | 'WRITING'
  | 'VERIFYING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN' | 'RETRY_REQUIRED';

export interface ProfitWriteStatus {
  enabled: boolean;
  configured: boolean;
  server?: string;
  database?: string;
  auth: 'windows' | 'sql';
  connected: boolean;
  identity?: string;
  code?: string;
}

/** Registro controlado en Profit (14F.2/14J). La escritura real sigue bloqueada por flag + permiso. */
export const apiProfitRegistrationService = {
  async writeStatus(): Promise<ProfitWriteStatus> {
    return api.get<ProfitWriteStatus>('/api/v1/profit/write-status');
  },

  async plan(id: string): Promise<ProfitPlan> {
    return api.post<ProfitPlan>(`/api/v1/requests/${id}/profit-plan`, {});
  },

  async create(id: string): Promise<ProfitCreationResult> {
    return api.post<ProfitCreationResult>(`/api/v1/requests/${id}/profit-create`, {});
  },

  async verify(id: string, coArt: string): Promise<ProfitVerifyResult> {
    return api.post<ProfitVerifyResult>(`/api/v1/requests/${id}/profit-verify`, { coArt });
  },

  async attempts(id: string): Promise<{ requestId: string; attempts: ProfitAttemptRecord[]; verifications: unknown[] }> {
    return api.get(`/api/v1/requests/${id}/profit-attempts`);
  },

  async retry(id: string): Promise<ProfitRetryResult> {
    return api.post<ProfitRetryResult>(`/api/v1/requests/${id}/profit-retry`, {});
  },
};

/** Deriva el estado operativo (§14K.5) sin inventar datos. */
export function profitOpState(args: {
  writeBlocked: boolean;
  busy: 'plan' | 'create' | 'verify' | 'retry' | null;
  plan: ProfitPlan | null;
  result: ProfitCreationResult | null;
  requestStatus: string;
}): ProfitOpState {
  if (args.writeBlocked) return 'DISABLED';
  if (args.busy === 'plan' || args.busy === 'retry') return 'VALIDATING';
  if (args.busy === 'create') return 'WRITING';
  if (args.busy === 'verify') return 'VERIFYING';
  if (args.result) {
    if (args.result.ok && args.result.reconcile === 'CREATED_AND_VERIFIED') return 'SUCCESS';
    if (!args.result.ok && args.result.errorCode === 'ERROR_PROFIT_AMBIGUOUS') return 'UNKNOWN';
    if (!args.result.ok) return 'FAILED';
  }
  if (args.requestStatus === 'ERROR_PROFIT') return 'RETRY_REQUIRED';
  if (args.plan && args.plan.available) return 'READY_TO_WRITE';
  return 'READY';
}

export const RECONCILE_LABELS: Record<ReconcileStatus, { text: string; tone: 'green' | 'yellow' | 'red' | 'gray' }> = {
  CREATED_AND_VERIFIED: { text: 'Creado y verificado', tone: 'green' },
  CREATED_WITH_DIFFERENCES: { text: 'Creado con diferencias', tone: 'yellow' },
  NOT_FOUND: { text: 'No encontrado', tone: 'red' },
  RECONCILIATION_ERROR: { text: 'Error de reconciliación', tone: 'red' },
};

export const PROFIT_ERROR_LABELS: Record<string, string> = {
  ERROR_CODE_ALLOCATION_EXHAUSTED: 'Sin correlativo disponible (10 intentos agotados)',
  ERROR_CODE_SPACE_EXHAUSTED: 'Rango de correlativos agotado para esta línea/sublinea',
  ERROR_PROFIT_AMBIGUOUS: 'Resultado desconocido: se ejecutó VERIFY, revise el resultado',
  ERROR_PROFIT_FK_VIOLATION: 'Referencia inexistente en Profit (línea, sublinea, unidad o tasa)',
  ERROR_PROFIT_CHECK_VIOLATION: 'Valor fuera del dominio permitido por Profit',
  ERROR_PROFIT_TRIGGER_REJECT: 'Rechazado por validación de Profit (trigger)',
  ERROR_PROFIT_ENGINE: 'Error interno del motor',
};

export function profitErrorLabel(code?: string): string {
  if (!code) return 'Error desconocido';
  return PROFIT_ERROR_LABELS[code] ?? code;
}

/** Acción recomendada según el error (§19). */
export function profitErrorAction(code?: string): string | null {
  switch (code) {
    case 'ERROR_PROFIT_FK_VIOLATION':
      return 'Revise que línea, sublínea, unidad y tasa existan en Profit; no se creó nada automáticamente.';
    case 'ERROR_PROFIT_CHECK_VIOLATION':
      return 'Revise tipo e impuesto contra los dominios de Profit y revalide.';
    case 'ERROR_PROFIT_TRIGGER_REJECT':
      return 'Revise la unidad de venta en Profit y revalide.';
    case 'ERROR_CODE_ALLOCATION_EXHAUSTED':
      return 'Revalide para obtener un nuevo candidato; no reintente a ciegas.';
    case 'ERROR_PROFIT_AMBIGUOUS':
      return 'Verifique en Profit antes de cualquier nuevo intento.';
    default:
      return null;
  }
}
