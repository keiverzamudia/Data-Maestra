import { api } from './api-client';

export interface ResetPreviewTable {
  table: string;
  label: string;
  count: number;
}

export interface ResetPreview {
  tables: ResetPreviewTable[];
  total: number;
}

export interface ResetResult {
  deleted: Record<string, number>;
  total: number;
  executedAt: string;
  actorId: string;
}

export const apiMantenimientoService = {
  async getResetPreview(): Promise<ResetPreview> {
    return api.get<ResetPreview>('/api/v1/maintenance/reset-preview');
  },

  async resetTestData(confirm: string): Promise<ResetResult> {
    return api.post<ResetResult>('/api/v1/maintenance/reset-test-data', { confirm });
  },
};
