import { requests } from '../../mock/requests';
import type { RequestService } from '../../contratos';
import type { Request } from '../../tipos';

const delay = (ms = 150) => new Promise(r => setTimeout(r, ms));
const paginate = <T,>(arr: T[], page = 1, pageSize = 10) => ({ data: arr.slice((page - 1) * pageSize, page * pageSize), total: arr.length });

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
    return paginate(d, p.page);
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
