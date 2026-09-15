import { requests } from '../../mock/requests';
import type { WarehouseApprovalService } from '../../contratos';

const delay = (ms = 150) => new Promise(r => setTimeout(r, ms));

/** Mock de la cola del Encargado de Almacén (15A): clasificados pendientes de aprobación. */
export const mockWarehouseApprovalService: WarehouseApprovalService = {
  async getPendingApprovals(companyId) {
    await delay();
    let d = requests.filter(r => r.status === 'ALMACEN_APROBADO');
    if (companyId) d = d.filter(r => r.companyId === companyId);
    return d;
  },
  async getApprovalDetail(id) {
    await delay();
    return requests.find(r => r.id === id);
  },
  async approveApproval(id) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (r) { r.status = 'PENDIENTE_CONTABILIDAD'; r.updatedAt = new Date().toISOString(); }
  },
  async returnApproval(id, comment) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (r) { r.status = 'PENDIENTE_GERENTE'; r.notes = comment; r.updatedAt = new Date().toISOString(); }
  },
  async rejectApproval(id, comment) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (r) { r.status = 'RECHAZADO'; r.notes = comment; r.updatedAt = new Date().toISOString(); }
  },
};
