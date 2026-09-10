import type { Company, Department, User, Role } from '../../tipos';
import { api } from './api-client';

export interface CompanyStats extends Company {
  userCount: number;
  departmentCount: number;
}

export interface MigrationPreview {
  from: { id: string; name: string; code: string };
  to: { id: string; name: string; code: string };
  users: number;
  departments: { id: string; name: string; code: string; memberships: number }[];
  unmappedNote: string;
  historicalRequests: number;
}

export interface MigrationResult {
  ok: boolean;
  moved: number;
  deduplicated: number;
  users: number;
  departmentsAffected: number;
  historicalRequests: number;
}

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

  async actualizarDepartamento(id: string, body: { name?: string; managerId?: string | null; active?: boolean }): Promise<Department> {
    return api.patch<Department>(`/api/v1/organizacion/departments/${id}`, body);
  },

  async crearDepartamento(body: { name: string; code: string; companyId: string; managerId?: string | null; active?: boolean }): Promise<Department> {
    return api.post<Department>('/api/v1/organizacion/departments', body);
  },

  async crearEmpresa(body: { name: string; code: string; active?: boolean }): Promise<Company> {
    return api.post<Company>('/api/v1/organizacion/companies', body);
  },

  async actualizarEmpresa(id: string, body: { name?: string; code?: string; active?: boolean }): Promise<Company> {
    return api.patch<Company>(`/api/v1/organizacion/companies/${id}`, body);
  },

  async eliminarEmpresa(id: string): Promise<{ ok: boolean }> {
    return api.delete<{ ok: boolean }>(`/api/v1/organizacion/companies/${id}`);
  },

  async vistaPreviaMigracion(fromId: string, toId: string): Promise<MigrationPreview> {
    return api.get<MigrationPreview>(`/api/v1/organizacion/companies/${fromId}/migration-preview?to=${encodeURIComponent(toId)}`);
  },

  async migrarEmpresa(body: { fromCompanyId: string; toCompanyId: string; departmentMap?: Record<string, string | null> }): Promise<MigrationResult> {
    return api.post<MigrationResult>('/api/v1/organizacion/companies/migrate', body);
  },
};
