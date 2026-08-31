import { sourceItems, sources, sourceMaps } from '../../mock/source-items';
import type { SourceService } from '../../contracts';

const delay = (ms = 150) => new Promise(r => setTimeout(r, ms));
const paginate = <T,>(arr: T[], page = 1, pageSize = 10) => ({ data: arr.slice((page - 1) * pageSize, page * pageSize), total: arr.length });

export const mockSourceService: SourceService = {
  async list(p = {}) {
    await delay();
    let d = [...sourceItems];
    if (p.companyId) d = d.filter(x => x.companyId === p.companyId);
    if (p.status) d = d.filter(x => x.status === p.status);
    if (p.search) {
      const s = p.search.toLowerCase();
      d = d.filter(x => x.originalDescription.toLowerCase().includes(s));
    }
    return paginate(d, p.page);
  },
  sources,
  sourceMaps,
};
