import type { RequestService } from '../../contratos';
import type { Request } from '../../tipos';
import { api } from './api-client';

export const apiRequestService: RequestService = {
  async list(params) {
    const sp = new URLSearchParams();
    if (params?.companyId) sp.set('companyId', params.companyId);
    if (params?.status) sp.set('status', params.status);
    if (params?.statuses?.length) sp.set('statuses', params.statuses.join(','));
    if (params?.mine) sp.set('mine', 'true');
    if (params?.sort) sp.set('sort', params.sort);
    if (params?.search) sp.set('search', params.search);
    if (params?.page) sp.set('page', String(params.page));
    if (params?.scope) sp.set('scope', params.scope);
    if (params?.bucket) sp.set('bucket', params.bucket);
    if (params?.requesterId) sp.set('requesterId', params.requesterId);
    if (params?.departmentId) sp.set('departmentId', params.departmentId);
    if (params?.dateFrom) sp.set('dateFrom', params.dateFrom);
    if (params?.dateTo) sp.set('dateTo', params.dateTo);
    if (params?.limit) sp.set('limit', String(params.limit));
    const qs = sp.toString();
    const res = await api.get<{ items: Request[]; total: number; filteredTotal: number; page: number; limit: number }>(`/api/v1/requests${qs ? `?${qs}` : ''}`);
    return { data: res.items, total: res.total, filteredTotal: res.filteredTotal, page: res.page, limit: res.limit };
  },

  async resumen() {
    return api.get<{ activas: number; historial: number; completadas: number; rechazadas: number; enProceso: number }>('/api/v1/requests/resumen');
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

export interface GlobalListParams {
  companyId?: string;
  status?: string;
  statuses?: string[];
  search?: string;
  bucket?: string;
  requesterId?: string;
  departmentId?: string;
  priority?: number;
  sort?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

/**
 * FASE 19 §28 — Todas las solicitudes (gerencial, requiere
 * SOLICITUDES.VIEW_ALL en backend). Paginación server-side.
 */
export async function apiRequestListAll(params?: GlobalListParams) {
  const sp = new URLSearchParams();
  if (params?.companyId) sp.set('companyId', params.companyId);
  if (params?.status) sp.set('status', params.status);
  if (params?.statuses?.length) sp.set('statuses', params.statuses.join(','));
  if (params?.search) sp.set('search', params.search);
  if (params?.bucket) sp.set('bucket', params.bucket);
  if (params?.requesterId) sp.set('requesterId', params.requesterId);
  if (params?.departmentId) sp.set('departmentId', params.departmentId);
  if (params?.priority !== undefined) sp.set('priority', String(params.priority));
  if (params?.sort) sp.set('sort', params.sort);
  if (params?.dateFrom) sp.set('dateFrom', params.dateFrom);
  if (params?.dateTo) sp.set('dateTo', params.dateTo);
  if (params?.page) sp.set('page', String(params.page));
  if (params?.limit) sp.set('limit', String(params.limit));
  const qs = sp.toString();
  const res = await api.get<{ items: import('../../tipos').Request[]; total: number; filteredTotal: number; page: number; limit: number }>(`/api/v1/requests/todas${qs ? `?${qs}` : ''}`);
  return { data: res.items, total: res.total, filteredTotal: res.filteredTotal, page: res.page, limit: res.limit };
}
