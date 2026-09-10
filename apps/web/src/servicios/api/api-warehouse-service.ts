import type { WarehouseService, ClassificationData, DryRunResult } from '../../contratos';
import type { Request } from '../../tipos';
import { api } from './api-client';

export const apiWarehouseService: WarehouseService = {
  async getPendingRequests(companyId) {
    const sp = new URLSearchParams();
    if (companyId) sp.set('companyId', companyId);
    const qs = sp.toString();
    return api.get<Request[]>(`/api/v1/warehouse/pending${qs ? `?${qs}` : ''}`);
  },

  async getRequestForClassification(id) {
    return api.get<Request | undefined>(`/api/v1/warehouse/${id}`);
  },

  async saveClassification(id, data: ClassificationData) {
    await api.post(`/api/v1/warehouse/${id}/classify`, data);
  },

  async approveClassification(id) {
    await api.post(`/api/v1/warehouse/${id}/approve`);
  },

  async returnRequest(id, comment) {
    await api.post(`/api/v1/warehouse/${id}/return`, { comment });
  },

  async rejectRequest(id, comment) {
    await api.post(`/api/v1/warehouse/${id}/reject`, { comment });
  },

  async validateArticle(id, data: ClassificationData): Promise<DryRunResult> {
    return api.post<DryRunResult>(`/api/v1/warehouse/${id}/validate`, data);
  },
};
