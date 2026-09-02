import type { AuditService } from '../../contratos';
import type { AuditEvent } from '../../tipos';
import { api } from './api-client';

export const apiAuditService: AuditService = {
  async getEvents(params) {
    const sp = new URLSearchParams();
    if (params?.entityId) sp.set('entityId', params.entityId);
    if (params?.action) sp.set('action', params.action);
    if (params?.page) sp.set('page', String(params.page));
    const qs = sp.toString();
    return api.get<{ data: AuditEvent[]; total: number }>(`/api/v1/audit/events${qs ? `?${qs}` : ''}`);
  },
};
