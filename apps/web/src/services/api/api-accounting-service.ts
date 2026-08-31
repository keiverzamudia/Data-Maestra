import type { AccountingService, AccountingCode } from '../../contracts';
import type { Request } from '../../types';
import { api } from './api-client';

export const apiAccountingService: AccountingService = {
  async getPendingApprovals(companyId) {
    const sp = new URLSearchParams();
    if (companyId) sp.set('companyId', companyId);
    const qs = sp.toString();
    return api.get<Request[]>(`/api/v1/accounting/pending${qs ? `?${qs}` : ''}`);
  },

  async approveAccounting(id, codes: AccountingCode[]) {
    await api.post(`/api/v1/accounting/${id}/approve`, { accountingCodes: codes });
  },

  async rejectAccounting(id, comment) {
    await api.post(`/api/v1/accounting/${id}/reject`, { comment });
  },
};
