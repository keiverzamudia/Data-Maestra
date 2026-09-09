import type { AuditService } from '../../contratos';
import type { AuditEvent } from '../../tipos';
import { api } from './api-client';

export interface AuditQuery {
  search?: string;
  action?: string;
  actorId?: string;
  entityId?: string;
  entityType?: string;
  correlationId?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface AuditEntry extends AuditEvent {
  actor?: { id: string; displayName: string; username: string } | null;
  actorCompany?: { id: string; name: string; code: string } | null;
  afectado?: { id: string; displayName: string; username: string } | null;
}

export interface AuditPage {
  data: AuditEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function toQuery(q: AuditQuery): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') sp.set(k, String(v));
  }
  return sp.toString();
}

export const apiAuditService: AuditService = {
  async getEvents(params) {
    const qs = toQuery((params ?? {}) as AuditQuery);
    return api.get<AuditPage>(`/api/v1/audit/events${qs ? `?${qs}` : ''}`);
  },

  async getById(id: string): Promise<AuditEntry> {
    return api.get<AuditEntry>(`/api/v1/audit/events/${encodeURIComponent(id)}`);
  },
};
