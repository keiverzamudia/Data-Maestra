import type { ImportRun } from '../../tipos';
import { api } from './api-client';

export const apiImportacionService = {
  async getImportRuns(companyId?: string): Promise<ImportRun[]> {
    const qs = companyId ? `?companyId=${companyId}` : '';
    return api.get<ImportRun[]>(`/api/v1/importaciones/runs${qs}`);
  },

  async getImportRunById(id: string): Promise<ImportRun | undefined> {
    return api.get<ImportRun>(`/api/v1/importaciones/runs/${id}`);
  },

  async createImportRun(data: {
    sourceName: string;
    companyId?: string;
    rowsRead?: number;
    rowsImported?: number;
    rowsUnchanged?: number;
    rowsFailed?: number;
    rowsSkipped?: number;
    errorSummary?: string;
  }): Promise<ImportRun> {
    return api.post<ImportRun>('/api/v1/importaciones/runs', data);
  },

  async getSourceItems(importRunId?: string, companyId?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (importRunId) params.set('importRunId', importRunId);
    if (companyId) params.set('companyId', companyId);
    const qs = params.toString();
    return api.get<any[]>(`/api/v1/importaciones/source-items${qs ? `?${qs}` : ''}`);
  },
};
