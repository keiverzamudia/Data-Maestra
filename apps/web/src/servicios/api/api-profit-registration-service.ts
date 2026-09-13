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

/** Registro controlado en Profit (14F.2). La escritura real sigue bloqueada por flag + permiso. */
export const apiProfitRegistrationService = {
  async plan(id: string): Promise<ProfitPlan> {
    return api.post<ProfitPlan>(`/api/v1/requests/${id}/profit-plan`, {});
  },

  async create(id: string): Promise<ProfitCreationResult> {
    return api.post<ProfitCreationResult>(`/api/v1/requests/${id}/profit-create`, {});
  },

  async verify(id: string, coArt: string): Promise<ProfitVerifyResult> {
    return api.post<ProfitVerifyResult>(`/api/v1/requests/${id}/profit-verify`, { coArt });
  },
};

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
