import { requests } from '../../mock/requests';
import type { WarehouseService, ClassificationData, DryRunResult } from '../../contratos';

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
  /** Mock del dry-run: validación local aproximada, sin Profit real. */
  async validateArticle(id, data: ClassificationData): Promise<DryRunResult> {
    await delay();
    const r = requests.find(x => x.id === id);
    const checks: DryRunResult['checks'] = [
      { key: 'estado', label: 'Estado clasificable', status: r ? 'COMPLETO' : 'ERROR', detail: r?.status },
      { key: 'descripcion', label: 'Descripción', status: (r?.requestedDescription?.trim().length ?? 0) >= 3 ? 'COMPLETO' : 'ERROR' },
      { key: 'grupo', label: 'Grupo Profit', status: data.groupCode ? 'COMPLETO' : 'FALTA' },
      { key: 'subgrupo', label: 'Subgrupo del grupo', status: data.subgroupCode ? 'COMPLETO' : 'FALTA' },
      { key: 'tipo', label: 'Tipo de artículo', status: data.articleType ? 'COMPLETO' : 'FALTA' },
      { key: 'unidad', label: 'Unidad Profit', status: data.unitCode ? 'COMPLETO' : 'FALTA', detail: 'Mock: sin verificación viva' },
      { key: 'impuesto', label: 'Impuesto (tipo_imp)', status: 'COMPLETO', detail: 'Mock: derivado por regla' },
      { key: 'duplicidad', label: 'Duplicidad', status: 'NO_APLICA', detail: 'Mock: no verificable' },
    ];
    const ready = ['estado', 'descripcion', 'grupo', 'subgrupo', 'tipo', 'unidad']
      .every(k => checks.find(c => c.key === k)?.status === 'COMPLETO');
    return { ready, checks, warnings: ['Modo mock: sin verificación viva contra Profit'], wouldProvision: [] };
  },
};
