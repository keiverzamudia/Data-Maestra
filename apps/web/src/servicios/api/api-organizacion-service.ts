import type { Company, Department, User, Role } from '../../tipos';
import { api } from './api-client';

export const apiOrganizacionService = {
  async getEmpresas(): Promise<Company[]> {
    return api.get<Company[]>('/api/v1/organizacion/companies');
  },

  async getDepartamentos(companyId?: string): Promise<Department[]> {
    const qs = companyId ? `?companyId=${companyId}` : '';
    return api.get<Department[]>(`/api/v1/organizacion/departments${qs}`);
  },

  async getUsuarios(companyId?: string): Promise<User[]> {
    const qs = companyId ? `?companyId=${companyId}` : '';
    return api.get<User[]>(`/api/v1/organizacion/users${qs}`);
  },

  async getRoles(): Promise<Role[]> {
    return api.get<Role[]>('/api/v1/organizacion/roles');
  },
};
