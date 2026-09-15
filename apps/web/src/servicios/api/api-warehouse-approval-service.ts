import type { WarehouseApprovalService } from '../../contratos';
import type { Request } from '../../tipos';
import { api } from './api-client';

export const apiWarehouseApprovalService: WarehouseApprovalService = {
  async getPendingApprovals(companyId) {
    const sp = new URLSearchParams();
    if (companyId) sp.set('companyId', companyId);
    const qs = sp.toString();
    return api.get<Request[]>(`/api/v1/warehouse-approval/pending${qs ? `?${qs}` : ''}`);
  },

  async getApprovalDetail(id) {
    return api.get<Request | undefined>(`/api/v1/warehouse-approval/${id}`);
  },

  async approveApproval(id) {
    await api.post(`/api/v1/warehouse-approval/${id}/approve`);
  },

  async returnApproval(id, comment) {
    await api.post(`/api/v1/warehouse-approval/${id}/return`, { comment });
  },

  async rejectApproval(id, comment) {
    await api.post(`/api/v1/warehouse-approval/${id}/reject`, { comment });
  },
};
