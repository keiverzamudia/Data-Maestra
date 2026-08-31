import { auditEvents } from '../../mock/extras';
import type { AuditService } from '../../contracts';

const delay = (ms = 150) => new Promise(r => setTimeout(r, ms));
const paginate = <T,>(arr: T[], page = 1, pageSize = 20) => ({ data: arr.slice((page - 1) * pageSize, page * pageSize), total: arr.length });

export const mockAuditService: AuditService = {
  async getEvents(params = {}) {
    await delay();
    let d = [...auditEvents];
    if (params.entityId) d = d.filter(e => e.entityId === params.entityId);
    if (params.action) d = d.filter(e => e.action === params.action);
    return paginate(d, params.page);
  },
};
