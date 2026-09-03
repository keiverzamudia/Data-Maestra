import { requests } from '../../mock/requests';
import type { WarehouseService, ClassificationData } from '../../contratos';

const delay = (ms = 150) => new Promise(r => setTimeout(r, ms));

export const mockWarehouseService: WarehouseService = {
  async getPendingRequests(companyId) {
    await delay();
    let d = requests.filter(r => ['PENDIENTE_ALMACEN', 'ALMACEN_APROBADO'].includes(r.status));
    if (companyId) d = d.filter(r => r.companyId === companyId);
    return d;
  },
  async getRequestForClassification(id) {
    await delay();
    return requests.find(r => r.id === id);
  },
  async saveClassification(id, data) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (r) {
      Object.assign(r, data, { status: 'ALMACEN_APROBADO', updatedAt: new Date().toISOString() });
    }
  },
  async approveClassification(id) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (r) { r.status = 'PENDIENTE_CONTABILIDAD'; r.updatedAt = new Date().toISOString(); }
  },
  async returnRequest(id, comment) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (r) { r.status = 'DEVUELTO'; r.notes = comment; r.updatedAt = new Date().toISOString(); }
  },
  async rejectRequest(id, comment) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (r) { r.status = 'RECHAZADO'; r.notes = comment; r.updatedAt = new Date().toISOString(); }
  },
};
