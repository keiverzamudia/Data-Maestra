import { api } from './api-client';

export interface CorporateCompany {
  code: string;
  name: string;
  rif: string;
  isStandard: boolean;
  enabled: boolean;
  /** FASE 26.2 — "Las descripciones de AD_TRANS mandan" en esta empresa. */
  allowDescSync: boolean;
}

export type CorporateDiffState =
  | 'IGUAL'
  | 'FALTA_EN_DESTINO'
  | 'DESCRIPCION_DIFERENTE'
  | 'DATOS_DIFERENTES'
  | 'NO_COMPATIBLE'
  | 'EQUIVALENTE'
  | 'ERROR';

export type CorporateSyncOp = 'NO_ACTION' | 'INSERT' | 'UPDATE_DESCRIPTION' | 'BLOCKED';

export interface CorporatePlanItem {
  catalog: string;
  code: string;
  /** FASE 26.4 — Padre canónico; parte de la identidad en catálogos jerárquicos. */
  parent?: string;
  standardValue: string;
  destValue: string | null;
  state: CorporateDiffState;
  operation: CorporateSyncOp;
  reason: string;
  safe: boolean;
  /** FASE 26: código local usado en el destino cuando hay equivalencia. */
  destCode?: string;
}

export interface CorporatePlanSummary {
  iguales: number;
  faltantes: number;
  descripcionesDiferentes: number;
  bloqueados: number;
  errores: number;
  /** FASE 26: cubiertos por una equivalencia registrada (sin escritura). */
  equivalentes: number;
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
  /** FASE 26.2 — empresas que autorizaron que AD_TRANS mande en descripciones. */
  descSync?: string[];
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

/**
 * FASE 26 — Equivalencia entre el código canónico de AD_TRANS y el código que
 * usa una empresa concreta. El vínculo es explícito: nada se deduce por
 * descripción parecida sin confirmación de una persona.
 */
export interface EquivalenceView {
  id: string;
  catalogKey: string;
  catalogLabel: string;
  companyCode: string;
  standardCode: string;
  localCode: string;
  active: boolean;
  note: string | null;
  createdBy: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface EquivalenceInput {
  catalogKey: string;
  companyCode: string;
  standardCode: string;
  localCode: string;
  note?: string;
}

export interface EquivalenceSuggestion {
  catalogKey: string;
  catalogLabel: string;
  standardCode: string;
  standardDescription: string;
  localCode: string;
  localDescription: string;
  reason: string;
}

export interface CorporateSyncStateRow {
  company: string;
  catalog: string;
  catalogLabel: string;
  lastSyncAt: string;
  lastRunId: string;
  summary: { inserts: number; updates: number } | null;
}

/** Homologación corporativa multiempresa (Fase 17). Comparar y preflight son solo lectura. */
export const apiCorporateService = {
  async companies(): Promise<CorporateCompany[]> {
    return api.get<CorporateCompany[]>('/api/v1/corporate/companies');
  },

  async compare(companies: string[], catalogs?: string[]): Promise<CorporateCompareResult> {
    return api.post<CorporateCompareResult>('/api/v1/corporate/compare', { companies, catalogs });
  },

  async preflight(companies: string[]): Promise<CorporatePreflight> {
    return api.post<CorporatePreflight>('/api/v1/corporate/preflight', { companies });
  },

  async homologate(
    companies: string[],
    opts?: { catalogs?: string[]; items?: Array<{ company: string; catalog: string; code: string; parent?: string }> },
  ): Promise<CorporateHomologateResult> {
    return api.post<CorporateHomologateResult>('/api/v1/corporate/homologate', {
      companies,
      catalogs: opts?.catalogs,
      items: opts?.items,
    });
  },

  // ---------------------------------------------------- FASE 26 — equivalencias

  async equivalences(company?: string): Promise<EquivalenceView[]> {
    const q = company ? `?company=${encodeURIComponent(company)}` : '';
    return api.get<EquivalenceView[]>(`/api/v1/corporate/equivalences${q}`);
  },

  async suggestEquivalences(company: string): Promise<EquivalenceSuggestion[]> {
    return api.post<EquivalenceSuggestion[]>('/api/v1/corporate/equivalences/suggest', { company });
  },

  async saveEquivalence(input: EquivalenceInput): Promise<EquivalenceView> {
    return api.post<EquivalenceView>('/api/v1/corporate/equivalences', input);
  },

  async deactivateEquivalence(id: string): Promise<{ id: string; active: boolean }> {
    return api.post<{ id: string; active: boolean }>('/api/v1/corporate/equivalences/deactivate', { id });
  },

  async syncState(company?: string): Promise<CorporateSyncStateRow[]> {
    const q = company ? `?company=${encodeURIComponent(company)}` : '';
    return api.get<CorporateSyncStateRow[]>(`/api/v1/corporate/sync-state${q}`);
  },
};

export const CORPORATE_STATE_LABELS: Record<CorporateDiffState, string> = {
  IGUAL: 'Igual',
  FALTA_EN_DESTINO: 'Nuevo en destino',
  DESCRIPCION_DIFERENTE: 'Descripción por actualizar',
  DATOS_DIFERENTES: 'Requiere revisión',
  NO_COMPATIBLE: 'Bloqueado',
  EQUIVALENTE: 'Equivalente en destino',
  ERROR: 'Error',
};

export const CORPORATE_OP_LABELS: Record<CorporateSyncOp, string> = {
  NO_ACTION: 'Sin acción',
  INSERT: 'Crear',
  UPDATE_DESCRIPTION: 'Actualizar descripción',
  BLOCKED: 'Bloqueado',
};
