import { requests } from '../../mock/requests';
import type { AccountingService, AccountingCode } from '../../contratos';

const delay = (ms = 150) => new Promise(r => setTimeout(r, ms));

export const mockAccountingService: AccountingService = {
  async getPendingApprovals(companyId) {
    await delay();
    let d = requests.filter(r => r.status === 'PENDIENTE_CONTABILIDAD');
    if (companyId) d = d.filter(r => r.companyId === companyId);
    return d;
  },
  async getAccountingDetail(id) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (!r) throw new Error('No encontrada');
    return r;
  },
  async approveAccounting(id, codes) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (r) { r.status = 'PENDIENTE_VALIDACION_MAESTRA'; r.updatedAt = new Date().toISOString(); }
  },
  async rejectAccounting(id, comment) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (r) { r.status = 'RECHAZADO'; r.notes = comment; r.updatedAt = new Date().toISOString(); }
  },
};
