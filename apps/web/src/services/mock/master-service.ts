import { masterItems } from '../../mock/master-items';
import type { MasterService } from '../../contracts';

const delay = (ms = 150) => new Promise(r => setTimeout(r, ms));
const paginate = <T,>(arr: T[], page = 1, pageSize = 10) => ({ data: arr.slice((page - 1) * pageSize, page * pageSize), total: arr.length });

export const mockMasterService: MasterService = {
  async list(p = {}) {
    await delay();
    let d = [...masterItems];
    if (p.status) d = d.filter(x => x.status === p.status);
    if (p.search) {
      const s = p.search.toLowerCase();
      d = d.filter(x => x.masterDescription.toLowerCase().includes(s) || x.masterCode.includes(s.toUpperCase()));
    }
    return paginate(d, p.page);
  },
  async getById(id) {
    await delay();
    return masterItems.find(m => m.id === id);
  },
};
