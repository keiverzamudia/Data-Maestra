import type { AccountingService, AccountingCode } from '../../contratos';
import type { Request } from '../../tipos';
import { api } from './api-client';

export const apiAccountingService: AccountingService = {
  async getPendingApprovals(companyId) {
    const sp = new URLSearchParams();
    if (companyId) sp.set('companyId', companyId);
    const qs = sp.toString();
    return api.get<Request[]>(`/api/v1/accounting/pending${qs ? `?${qs}` : ''}`);
  },

  async getAccountingDetail(id: string) {
    return api.get<Request>(`/api/v1/accounting/${encodeURIComponent(id)}`);
  },

  async approveAccounting(id, codes: AccountingCode[], comment?: string) {
    await api.post(`/api/v1/accounting/${id}/approve`, { accountingCodes: codes, comment });
  },

  async rejectAccounting(id, comment) {
    await api.post(`/api/v1/accounting/${id}/reject`, { comment });
  },
};
