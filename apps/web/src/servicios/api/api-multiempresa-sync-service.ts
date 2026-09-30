import { api } from './api-client';

export interface PendingSlice {
  companyCode: string;
  catalogKey: string;
  catalogLabel: string;
  pending: number;
  conflicts: number;
  missing: number;
}

export interface MultiEmpresaStatus {
  masterTotal: number;
  pending: PendingSlice[];
}

export interface MasterEntry {
  catalogKey: string;
  code: string;
  description: string;
  parentCode: string | null;
}

export type ProposalStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';
export type ProposalReason = 'FALTA' | 'CONFLICTO';

export interface ProposalView {
  id: string;
  catalogKey: string;
  catalogLabel: string;
  companyCode: string;
  masterCode: string;
  masterDescription: string;
  localCode: string;
  reason: ProposalReason;
  detail: string;
  status: ProposalStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export type LineState = 'IGUAL' | 'FALTA' | 'CONFLICTO' | 'RESUELTO' | 'CREADO';

export interface CatalogDiffLine {
  catalogKey: string;
  catalogLabel: string;
  masterCode: string;
  masterDescription: string;
  state: LineState;
  localExistingCode: string | null;
  localExistingDescription: string | null;
  proposedCode: string | null;
  detail: string;
}

export interface CatalogCount {
  key: string;
  label: string;
  iguales: number;
  faltantes: number;
  conflictos: number;
  resueltos: number;
  creados: number;
  total: number;
  pending: number;
}

export interface CompanyCatalogReport {
  company: string;
  name: string;
  isStandard: boolean;
  counts: { iguales: number; faltantes: number; conflictos: number; resueltos: number; creados: number };
  catalogs: CatalogCount[];
  lines: CatalogDiffLine[];
  totalProblems: number;
  offset: number;
  limit: number;
}

export interface CatalogAnalysis {
  standard: string;
  masterTotal: number;
  catalogs: string[];
  companies: CompanyCatalogReport[];
  pendingProposals: number;
  autoCreated: number;
  analyzedAt: string;
}

export interface AnalyzeOptions {
  company?: string;
  catalog?: string;
  catalogs?: string[];
  includeProviders?: boolean;
  autoCreate?: boolean;
  limit?: number;
  offset?: number;
}

const BASE = '/api/v1/profit/multiempresa';

/** FASE 27 — Manejo Multiempresa: integración de catálogos hacia las empresas. */
export const apiMultiempresaSyncService = {
  async status(): Promise<MultiEmpresaStatus> {
    return api.get<MultiEmpresaStatus>(`${BASE}/status`);
  },

  async master(catalog?: string): Promise<MasterEntry[]> {
    const q = catalog ? `?catalog=${encodeURIComponent(catalog)}` : '';
    return api.get<MasterEntry[]>(`${BASE}/master${q}`);
  },

  async syncMaster(): Promise<{ total: number; byCatalog: Record<string, number> }> {
    return api.post<{ total: number; byCatalog: Record<string, number> }>(`${BASE}/master/sync`);
  },

  async analyze(opts: AnalyzeOptions = {}): Promise<CatalogAnalysis> {
    return api.post<CatalogAnalysis>(`${BASE}/analyze`, opts);
  },

  async proposals(company?: string, catalog?: string): Promise<ProposalView[]> {
    const q = [company ? `company=${encodeURIComponent(company)}` : '', catalog ? `catalog=${encodeURIComponent(catalog)}` : '']
      .filter(Boolean).join('&');
    return api.get<ProposalView[]>(`${BASE}/proposals${q ? `?${q}` : ''}`);
  },

  async confirm(id: string, localCode?: string): Promise<ProposalView> {
    return api.post<ProposalView>(`${BASE}/proposals/confirm`, { id, localCode });
  },

  async confirmBulk(ids: string[], overrides: Record<string, string> = {}): Promise<{ confirmed: number; errors: string[] }> {
    return api.post<{ confirmed: number; errors: string[] }>(`${BASE}/proposals/confirm-bulk`, { ids, overrides });
  },

  async confirmAll(company: string, catalog?: string): Promise<{ confirmed: number; errors: string[] }> {
    return api.post<{ confirmed: number; errors: string[] }>(`${BASE}/proposals/confirm-all`, { company, catalog });
  },

  async reject(id: string, note?: string): Promise<ProposalView> {
    return api.post<ProposalView>(`${BASE}/proposals/reject`, { id, note });
  },

  /** Descarta las pendientes de catálogos fuera de alcance (por defecto prov/proceden). */
  async discardCatalogs(catalogs?: string[]): Promise<{ rejected: number; catalogs: string[] }> {
    return api.post<{ rejected: number; catalogs: string[] }>(`${BASE}/proposals/discard-catalogs`, { catalogs });
  },
};
