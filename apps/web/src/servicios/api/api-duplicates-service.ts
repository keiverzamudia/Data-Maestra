import { api } from './api-client';

export interface DuplicatesResumen {
  historicalArticles: number;
  analyzed: number;
  insufficient: number;
  relations: number;
  groups: number;
  withConflicts: number;
  withoutConflicts: number;
  byClassification: Array<{ classification: string; count: number }>;
}

export interface DuplicateRelation {
  id: string;
  pairKey: string;
  companyACode: string;
  profitACode: string;
  companyBCode: string;
  profitBCode: string;
  score: number;
  classification: string;
  evidencesJson: string;
  conflictsJson: string;
  explanation: string;
  engineVersion: string;
  coverageA: string | null;
  coverageB: string | null;
  status: string;
}

export interface DuplicateGroupMember {
  companyCode: string;
  profitArticleCode: string;
}

export interface DuplicateGroup {
  id: string;
  status: string;
  memberCount: number;
  engineVersion: string;
  summaryJson: string | null;
  members: DuplicateGroupMember[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface DuplicateFilters {
  companyCode?: string;
  classification?: string;
  conConflictos?: boolean;
  coverage?: string;
  status?: string;
  code?: string;
  text?: string;
  orderBy?: 'score' | 'classification' | 'detectedAt' | 'evidenceCount' | 'conflictCount';
  orderDir?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

function toParams(f: DuplicateFilters): string {
  const sp = new URLSearchParams();
  if (f.companyCode) sp.set('companyCode', f.companyCode);
  if (f.classification) sp.set('classification', f.classification);
  if (f.conConflictos !== undefined) sp.set('conConflictos', String(f.conConflictos));
  if (f.coverage) sp.set('coverage', f.coverage);
  if (f.status) sp.set('status', f.status);
  if (f.code) sp.set('code', f.code);
  if (f.text) sp.set('text', f.text);
  if (f.orderBy) sp.set('orderBy', f.orderBy);
  if (f.orderDir) sp.set('orderDir', f.orderDir);
  if (f.page) sp.set('page', String(f.page));
  if (f.limit) sp.set('limit', String(f.limit));
  return sp.toString();
}

/** FASE 23 — Auditoría histórica de posibles duplicados (solo lectura). */
export const apiDuplicatesService = {
  async resumen(): Promise<DuplicatesResumen> {
    return api.get<DuplicatesResumen>('/api/v1/matching/historico/duplicados/resumen');
  },

  async relaciones(f: DuplicateFilters = {}): Promise<Paged<DuplicateRelation>> {
    const qs = toParams(f);
    return api.get<Paged<DuplicateRelation>>(`/api/v1/matching/historico/duplicados/relaciones${qs ? `?${qs}` : ''}`);
  },

  async grupos(f: { companyCode?: string; page?: number; limit?: number } = {}): Promise<Paged<DuplicateGroup>> {
    const sp = new URLSearchParams();
    if (f.companyCode) sp.set('companyCode', f.companyCode);
    if (f.page) sp.set('page', String(f.page));
    if (f.limit) sp.set('limit', String(f.limit));
    const qs = sp.toString();
    return api.get<Paged<DuplicateGroup>>(`/api/v1/matching/historico/duplicados/grupos${qs ? `?${qs}` : ''}`);
  },

  async articulo(companyCode: string, profitArticleCode: string): Promise<Paged<DuplicateRelation>> {
    return api.get<Paged<DuplicateRelation>>(
      `/api/v1/matching/historico/duplicados/articulos/${encodeURIComponent(companyCode)}/${encodeURIComponent(profitArticleCode)}`,
    );
  },
};
