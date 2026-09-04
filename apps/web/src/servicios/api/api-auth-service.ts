import { api } from './api-client';

export interface LoginUser {
  id: string;
  displayName: string;
  active: boolean;
}

export interface LoginResponse {
  authenticated: boolean;
  user: LoginUser;
  mustChangePassword: boolean;
}

export interface LoginCandidate {
  id: string;
  displayName: string;
}

export interface SessionMembership {
  companyId: string;
  company: { id: string; name: string; code: string };
  departmentId: string | null;
  department: { id: string; name: string; code: string } | null;
  roleCodes: string[];
}

export interface SessionState {
  authenticated: boolean;
  user: LoginUser & { mustChangePassword?: boolean };
  mustChangePassword: boolean;
  roleCodes: string[];
  permissions: string[];
  memberships: SessionMembership[];
  sessionId: string;
}

/** FASE 10E: credenciales reales + sesión persistente (cookie HttpOnly). Sin JWT en JS. */
export const apiAuthService = {
  async buscarUsuarios(search: string): Promise<LoginCandidate[]> {
    const qs = search ? `?search=${encodeURIComponent(search)}` : '';
    return api.get<LoginCandidate[]>(`/api/v1/auth/usuarios${qs}`);
  },

  async login(userId: string, password: string): Promise<LoginResponse> {
    return api.post<LoginResponse>('/api/v1/auth/login', { userId, password });
  },

  async logout(): Promise<{ ok: boolean }> {
    return api.post<{ ok: boolean }>('/api/v1/auth/logout');
  },

  async session(): Promise<SessionState> {
    return api.get<SessionState>('/api/v1/auth/session');
  },

  async cambiarPassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }> {
    return api.post<{ ok: boolean }>('/api/v1/auth/cambiar-password', { currentPassword, newPassword });
  },
};
