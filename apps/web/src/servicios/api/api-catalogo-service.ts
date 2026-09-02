import type { CatalogGroup, CatalogSubgroup, CatalogCategory, Brand, UnitOfMeasure } from '../../tipos';
import { api } from './api-client';

export const apiCatalogoService = {
  async getGrupos(): Promise<CatalogGroup[]> {
    return api.get<CatalogGroup[]>('/api/v1/catalogs/groups');
  },

  async getSubgrupos(groupId?: string): Promise<CatalogSubgroup[]> {
    const qs = groupId ? `?groupId=${groupId}` : '';
    return api.get<CatalogSubgroup[]>(`/api/v1/catalogs/subgroups${qs}`);
  },

  async getCategorias(subgroupId?: string): Promise<CatalogCategory[]> {
    const qs = subgroupId ? `?subgroupId=${subgroupId}` : '';
    return api.get<CatalogCategory[]>(`/api/v1/catalogs/categories${qs}`);
  },

  async getMarcas(): Promise<Brand[]> {
    return api.get<Brand[]>('/api/v1/catalogs/brands');
  },

  async getUnidades(): Promise<UnitOfMeasure[]> {
    return api.get<UnitOfMeasure[]>('/api/v1/catalogs/units');
  },
};
