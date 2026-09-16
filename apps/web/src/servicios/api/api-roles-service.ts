import { api } from './api-client';

export interface AdminRole {
  code: string;
  name: string;
  description: string | null;
  defaultView: string | null;
  userCount: number;
  permissionCount: number;
  permissions: string[];
}

export interface RoleDetail {
  code: string;
  name: string;
  description: string | null;
  defaultView: string | null;
  availableViews: Array<{ key: string; label: string; route: string; permission: string }>;
  permissions: Array<{ code: string; description: string | null }>;
  catalog: Array<{ code: string; description: string | null }>;
  users: Array<{
    displayName: string;
    username: string;
    active: boolean;
    company: string | null;
    department: string | null;
  }>;
}

/** Administración de roles (requiere ADMIN.MANAGE en backend). */
export const apiRolesService = {
  async listar(): Promise<AdminRole[]> {
    return api.get<AdminRole[]>('/api/v1/roles');
  },

  async detalle(code: string): Promise<RoleDetail> {
    return api.get<RoleDetail>(`/api/v1/roles/${encodeURIComponent(code)}`);
  },

  async conceder(code: string, permissionCode: string): Promise<{ ok: boolean; created: boolean }> {
    return api.post<{ ok: boolean; created: boolean }>(`/api/v1/roles/${encodeURIComponent(code)}/permisos`, { permissionCode });
  },

  async quitar(code: string, permissionCode: string): Promise<{ ok: boolean; removed: boolean }> {
    return api.delete<{ ok: boolean; removed: boolean }>(`/api/v1/roles/${encodeURIComponent(code)}/permisos`, { permissionCode });
  },

  /** Vista principal del rol (ADMIN.MANAGE). null = fallback Mis solicitudes. */
  async vista(code: string, defaultView: string | null): Promise<{ ok: boolean; defaultView: string | null }> {
    return api.put<{ ok: boolean; defaultView: string | null }>(`/api/v1/roles/${encodeURIComponent(code)}/vista`, { defaultView });
  },

  /** Vista principal resuelta del usuario autenticado (fallback incluido). */
  async miVista(): Promise<{ key: string; label: string; route: string; permission: string }> {
    return api.get(`/api/v1/roles/mi-vista`);
  },
};
