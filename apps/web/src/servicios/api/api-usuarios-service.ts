import { api } from './api-client';

export interface AdminMembership {
  company: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
  role: { code: string; name: string };
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  profitCode: string | null;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  userRoles: AdminMembership[];
}

export interface ProfitSyncResult {
  runId: string;
  created: number;
  updated: number;
  missing: number;
  errors: number;
  totalProfit: number;
}

export interface BulkAssignResult {
  correlationId: string;
  total: number;
  assigned: number;
  alreadyAssigned: number;
  failed: number;
  results: Array<{ userId: string; status: 'ASSIGNED' | 'ALREADY_ASSIGNED' | 'FAILED'; message?: string }>;
}

export type PermissionSource = 'HEREDADO' | 'CONCEDIDO' | 'DENEGADO';

export interface EffectivePerm {
  code: string;
  source: PermissionSource;
  granted: boolean;
}

export interface AdminMembershipFull {
  id: string;
  company: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
  role: { code: string; name: string };
}

export interface AdminUserDetail {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  profitCode: string | null;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  userRoles: AdminMembershipFull[];
  permissionOverrides: Array<{ effect: string; permission: { code: string } }>;
  roleCodes: string[];
  effectivePermissions: EffectivePerm[];
  permissionCatalog: string[];
}

/** Administración de usuarios (requiere ADMIN.MANAGE en backend). */
export const apiUsuariosService = {
  async buscar(search: string): Promise<AdminUser[]> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return api.get<AdminUser[]>(`/api/v1/usuarios${qs}`);
  },

  async sincronizarProfit(): Promise<ProfitSyncResult> {
    return api.post<ProfitSyncResult>('/api/v1/usuarios/sincronizar-profit');
  },

  async detalle(id: string): Promise<AdminUserDetail> {
    return api.get<AdminUserDetail>(`/api/v1/usuarios/${encodeURIComponent(id)}`);
  },

  async cambiarEstado(id: string, active: boolean): Promise<AdminUser> {
    return api.patch<AdminUser>(`/api/v1/usuarios/${encodeURIComponent(id)}/active`, { active });
  },

  async asignarRol(id: string, body: { roleCode: string; companyId: string; departmentId?: string | null }): Promise<{ ok: boolean }> {
    return api.post<{ ok: boolean }>(`/api/v1/usuarios/${encodeURIComponent(id)}/roles`, body);
  },

  async quitarRol(id: string, body: { roleCode: string; companyId: string; departmentId?: string | null }): Promise<{ ok: boolean }> {
    return api.delete<{ ok: boolean }>(`/api/v1/usuarios/${encodeURIComponent(id)}/roles`, body);
  },

  async fijarOverride(id: string, body: { permissionCode: string; effect: 'GRANT' | 'DENY' }): Promise<{ ok: boolean }> {
    return api.post<{ ok: boolean }>(`/api/v1/usuarios/${encodeURIComponent(id)}/permisos`, body);
  },

  async quitarOverride(id: string, permissionCode: string): Promise<{ ok: boolean }> {
    return api.delete<{ ok: boolean }>(`/api/v1/usuarios/${encodeURIComponent(id)}/permisos`, { permissionCode });
  },

  async restablecerPassword(id: string): Promise<{ ok: boolean; mustChangePassword: boolean }> {
    return api.post<{ ok: boolean; mustChangePassword: boolean }>(`/api/v1/usuarios/${encodeURIComponent(id)}/reset-password`);
  },

  async asignarRolMasivo(body: { userIds: string[]; roleCode: string; companyId: string; departmentId?: string | null }): Promise<BulkAssignResult> {
    return api.post<BulkAssignResult>('/api/v1/usuarios/asignar-rol-masivo', body);
  },
};
