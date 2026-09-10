import { requests } from '../../mock/requests';
import type { RequestService } from '../../contratos';
import type { Request } from '../../tipos';

const delay = (ms = 150) => new Promise(r => setTimeout(r, ms));

export const mockRequestService: RequestService = {
  async list(p = {}) {
    await delay();
    let d = [...requests];
    if (p.companyId) d = d.filter(r => r.companyId === p.companyId);
    if (p.status) d = d.filter(r => r.status === p.status);
    if (p.search) {
      const s = p.search.toLowerCase();
      d = d.filter(r => r.requestedDescription.toLowerCase().includes(s) || String(r.requestNumber).includes(s));
    }
    const page = p.page ?? 1;
    const limit = p.limit ?? 25;
    const items = d.slice((page - 1) * limit, page * limit);
    return { data: items, total: d.length, filteredTotal: d.length, page, limit };
  },
  async resumen() {
    await delay();
    const done = (s: string) => ['APROBADO_FINAL', 'REGISTRADO_PROFIT'].includes(s);
    const rej = (s: string) => s === 'RECHAZADO';
    return {
      activas: requests.length,
      historial: requests.length,
      completadas: requests.filter(r => done(r.status)).length,
      rechazadas: requests.filter(r => rej(r.status)).length,
      enProceso: requests.filter(r => !done(r.status) && !rej(r.status)).length,
    };
  },
  async getById(id) {
    await delay();
    return requests.find(r => r.id === id);
  },
  async create(data) {
    await delay();
    const n: Request = {
      id: 'rq' + Date.now(),
      requestNumber: 1010 + requests.length,
      companyId: data.companyId!,
      departmentId: data.departmentId!,
      requesterId: 'u1',
      requestedDescription: data.requestedDescription || '',
      purpose: data.purpose || '',
      referencePhotoUri: data.referencePhotoUri,
      status: 'BORRADOR',
      priority: data.priority || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    } as Request;
    requests.unshift(n);
    return n;
  },
  async submit(id) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (r) { r.status = 'PENDIENTE_GERENTE'; r.updatedAt = new Date().toISOString(); }
    return r!;
  },
  async approve(id, comment) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (r) { r.status = 'PENDIENTE_ALMACEN'; r.updatedAt = new Date().toISOString(); }
  },
  async reject(id, comment) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (r) { r.status = 'RECHAZADO'; r.notes = comment; r.updatedAt = new Date().toISOString(); }
  },
  async returnRequest(id, comment) {
    await delay();
    const r = requests.find(x => x.id === id);
    if (r) { r.status = 'DEVUELTO'; r.notes = comment; r.updatedAt = new Date().toISOString(); }
  },
};
