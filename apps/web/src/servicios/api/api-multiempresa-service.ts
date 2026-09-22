import { api } from './api-client';

export type CompatibilityStatus =
  | 'COMPATIBLE'
  | 'COMPATIBLE_WITH_WARNING'
  | 'INCOMPATIBLE'
  | 'DESHABILITADA';

export interface CompatibilityCheckView {
  key: string;
  ok: boolean;
  detail: string;
}

export interface CompanyCompatibility {
  company: string;
  name: string;
  isStandard: boolean;
  enabled: boolean;
  status: CompatibilityStatus;
  checks: CompatibilityCheckView[];
  blockingReasons: string[];
  warnings: string[];
  codeStatus: 'LIBRE' | 'OCUPADO' | 'SIN_CANDIDATO';
  candidate: string | null;
}

export interface CompatibilityAnalysis {
  requestId: string;
  coArt: string | null;
  description: string;
  companies: CompanyCompatibility[];
  compatibleCount: number;
  incompatibleCount: number;
  analyzedAt: string;
}

export type CompanyInsertOutcome =
  | 'INSERTADO'
  | 'YA_EXISTE'
  | 'OMITIDA_NO_COMPATIBLE'
  | 'OMITIDA_DESHABILITADA'
  | 'ERROR';

export interface CompanyInsertResult {
  company: string;
  outcome: CompanyInsertOutcome;
  coArt: string | null;
  detail: string;
  differences: string[];
}

export interface MultiInsertResult {
  requestId: string;
  coArt: string;
  ok: boolean;
  results: CompanyInsertResult[];
  errorCode?: string;
}

export interface ProfitCompanyConfigView {
  code: string;
  name: string;
  isStandard: boolean;
  enabled: boolean;
}

/** FASE 25 — Analizador de compatibilidad e inserción multiempresa. */
export const apiMultiCompanyService = {
  async companies(): Promise<ProfitCompanyConfigView[]> {
    return api.get<ProfitCompanyConfigView[]>('/api/v1/profit/multi-company/companies');
  },

  async analyze(requestId: string): Promise<CompatibilityAnalysis> {
    return api.post<CompatibilityAnalysis>('/api/v1/profit/multi-company/analyze', { requestId });
  },

  async insert(requestId: string, companies: string[]): Promise<MultiInsertResult> {
    return api.post<MultiInsertResult>('/api/v1/profit/multi-company/insert', { requestId, companies });
  },

  async saveConfig(code: string, enabled: boolean): Promise<ProfitCompanyConfigView> {
    return api.post<ProfitCompanyConfigView>('/api/v1/profit/multi-company/companies/config', { code, enabled });
  },

  async setStandard(code: string): Promise<ProfitCompanyConfigView> {
    return api.post<ProfitCompanyConfigView>('/api/v1/profit/multi-company/companies/standard', { code, confirm: true });
  },
};
