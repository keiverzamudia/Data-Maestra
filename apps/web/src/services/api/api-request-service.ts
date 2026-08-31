import type { RequestService } from '../../contracts';
import type { Request } from '../../types';
import { api } from './api-client';

export const apiRequestService: RequestService = {
  async list(params) {
    const sp = new URLSearchParams();
    if (params?.companyId) sp.set('companyId', params.companyId);
    if (params?.status) sp.set('status', params.status);
    if (params?.search) sp.set('search', params.search);
    if (params?.page) sp.set('page', String(params.page));
    const qs = sp.toString();
    const result = await api.get<Request[]>(`/api/v1/requests${qs ? `?${qs}` : ''}`);
    return { data: result, total: result.length };
  },

  async getById(id) {
    return api.get<Request>(`/api/v1/requests/${id}`);
  },

  async create(data) {
    return api.post<Request>('/api/v1/requests', {
      requestedDescription: data.requestedDescription,
      purpose: data.purpose,
      priority: data.priority,
    });
  },

  async submit(id) {
    return api.post<Request>(`/api/v1/requests/${id}/submit`);
  },

  async approve(id) {
    await api.post(`/api/v1/requests/${id}/approve`, { action: 'APPROVE' });
  },

  async reject(id, comment) {
    await api.post(`/api/v1/requests/${id}/approve`, { action: 'REJECT', comment });
  },

  async returnRequest(id, comment) {
    await api.post(`/api/v1/requests/${id}/approve`, { action: 'RETURN', comment });
  },
};
