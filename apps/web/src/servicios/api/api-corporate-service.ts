import { api } from './api-client';

export interface CorporateCompany {
  code: string;
  name: string;
  rif: string;
  isStandard: boolean;
}

export type CorporateDiffState =
  | 'IGUAL'
  | 'FALTA_EN_DESTINO'
  | 'DESCRIPCION_DIFERENTE'
  | 'DATOS_DIFERENTES'
  | 'NO_COMPATIBLE'
  | 'ERROR';

export type CorporateSyncOp = 'NO_ACTION' | 'INSERT' | 'UPDATE_DESCRIPTION' | 'BLOCKED';

export interface CorporatePlanItem {
  catalog: string;
  code: string;
  standardValue: string;
  destValue: string | null;
  state: CorporateDiffState;
  operation: CorporateSyncOp;
  reason: string;
  safe: boolean;
}

export interface CorporatePlanSummary {
  iguales: number;
  faltantes: number;
  descripcionesDiferentes: number;
  bloqueados: number;
  errores: number;
  total: number;
}

export interface CorporateCompanyPlan {
  company: string;
  isStandard: boolean;
  items: CorporatePlanItem[];
  summary: CorporatePlanSummary;
}

export interface CorporateCompareResult {
  standard: string;
  companies: CorporateCompanyPlan[];
  executable: boolean;
}

export interface CorporatePreflightCheck {
  key: string;
  ok: boolean;
  detail: string;
}

export interface CorporatePreflight {
  ok: boolean;
  companies: Array<{ company: string; ok: boolean; checks: CorporatePreflightCheck[] }>;
}

export interface CorporateHomologateResult {
  ok: boolean;
  companies: string[];
  inserts: number;
  updates: number;
  perCompany: Array<{ company: string; inserts: number; updates: number }>;
  errorCode?: string;
  errorDetail?: string;
  rolledBack?: boolean;
}

/** Homologación corporativa multiempresa (Fase 17). Comparar y preflight son solo lectura. */
export const apiCorporateService = {
  async companies(): Promise<CorporateCompany[]> {
    return api.get<CorporateCompany[]>('/api/v1/corporate/companies');
  },

  async compare(companies: string[]): Promise<CorporateCompareResult> {
    return api.post<CorporateCompareResult>('/api/v1/corporate/compare', { companies });
  },

  async preflight(companies: string[]): Promise<CorporatePreflight> {
    return api.post<CorporatePreflight>('/api/v1/corporate/preflight', { companies });
  },

  async homologate(companies: string[]): Promise<CorporateHomologateResult> {
    return api.post<CorporateHomologateResult>('/api/v1/corporate/homologate', { companies });
  },
};

export const CORPORATE_STATE_LABELS: Record<CorporateDiffState, string> = {
  IGUAL: 'Igual',
  FALTA_EN_DESTINO: 'Nuevo en destino',
  DESCRIPCION_DIFERENTE: 'Descripción por actualizar',
  DATOS_DIFERENTES: 'Requiere revisión',
  NO_COMPATIBLE: 'Bloqueado',
  ERROR: 'Error',
};

export const CORPORATE_OP_LABELS: Record<CorporateSyncOp, string> = {
  NO_ACTION: 'Sin acción',
  INSERT: 'Crear',
  UPDATE_DESCRIPTION: 'Actualizar descripción',
  BLOCKED: 'Bloqueado',
};
