import { api } from './api-client';

export interface AdminRole {
  code: string;
  name: string;
  description: string | null;
  userCount: number;
  permissionCount: number;
  permissions: string[];
}

export interface RoleDetail {
  code: string;
  name: string;
  description: string | null;
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
};
