import { requests } from '../../mock/requests';
import type { AccountingService, AccountingCode } from '../../contracts';

const delay = (ms = 150) => new Promise(r => setTimeout(r, ms));

export const mockAccountingService: AccountingService = {
  async getPendingApprovals(companyId) {
    await delay();
    let d = requests.filter(r => r.status === 'PENDING_ACCOUNTING');
    if (companyId) d = d.filter(r => r.companyId === companyId);
    return d;
  },
  async approveAccounting(id, codes) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (r) { r.status = 'APPROVED'; r.updatedAt = new Date().toISOString(); }
  },
  async rejectAccounting(id, comment) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (r) { r.status = 'RETURNED'; r.notes = comment; r.updatedAt = new Date().toISOString(); }
  },
};
