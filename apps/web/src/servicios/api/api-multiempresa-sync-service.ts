import { api } from './api-client';

export interface MultiEmpresaStatus {
  masterTotal: number;
  pending: Array<{ companyCode: string; pending: number; conflicts: number; missing: number }>;
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

export interface CatalogDiffLine {
  catalogKey: string;
  catalogLabel: string;
  masterCode: string;
  masterDescription: string;
  state: 'IGUAL' | 'FALTA' | 'CONFLICTO' | 'RESUELTO';
  localExistingCode: string | null;
  localExistingDescription: string | null;
  proposedCode: string | null;
  detail: string;
}

export interface CompanyCatalogReport {
  company: string;
  name: string;
  isStandard: boolean;
  counts: { iguales: number; faltantes: number; conflictos: number; resueltos: number };
  lines: CatalogDiffLine[];
}

export interface CatalogAnalysis {
  standard: string;
  masterTotal: number;
  companies: CompanyCatalogReport[];
  pendingProposals: number;
  analyzedAt: string;
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

  async analyze(): Promise<CatalogAnalysis> {
    return api.post<CatalogAnalysis>(`${BASE}/analyze`);
  },

  async proposals(company?: string): Promise<ProposalView[]> {
    const q = company ? `?company=${encodeURIComponent(company)}` : '';
    return api.get<ProposalView[]>(`${BASE}/proposals${q}`);
  },

  async confirm(id: string, localCode?: string): Promise<ProposalView> {
    return api.post<ProposalView>(`${BASE}/proposals/confirm`, { id, localCode });
  },

  async confirmAll(company: string): Promise<{ confirmed: number; errors: string[] }> {
    return api.post<{ confirmed: number; errors: string[] }>(`${BASE}/proposals/confirm-all`, { company });
  },

  async reject(id: string, note?: string): Promise<ProposalView> {
    return api.post<ProposalView>(`${BASE}/proposals/reject`, { id, note });
  },
};
