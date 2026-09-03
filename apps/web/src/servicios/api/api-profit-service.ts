import { api } from './api-client';

export interface ProfitAccount {
  code: string;
  description: string;
}

/**
 * Cuentas contables Profit (READ-ONLY, catálogo maestro sccuenta).
 * Búsqueda server-side por código o nombre + paginación (limit/offset).
 */
export const apiProfitService = {
  async getAccounts(search?: string, limit = 20, offset = 0): Promise<ProfitAccount[]> {
    const sp = new URLSearchParams();
    if (search) sp.set('search', search);
    sp.set('limit', String(limit));
    sp.set('offset', String(offset));
    return api.get<ProfitAccount[]>(`/api/v1/profit/accounts?${sp.toString()}`);
  },
};

export interface ProfitGroup {
  co_lin: string;
  lin_des: string;
}

export interface ProfitSubgroup {
  co_lin: string;
  co_subl: string;
  subl_des: string;
}

export interface ProfitCategory {
  co_cat: string;
  cat_des: string;
}

export interface ProfitBrand {
  co_col: string;
  des_col: string;
}

/** Catálogos de clasificación directos desde Profit (FASE 8F, READ-ONLY). */
export const apiProfitCatalogService = {
  async getGroups(): Promise<ProfitGroup[]> {
    return api.get<ProfitGroup[]>('/api/v1/profit/groups');
  },

  async getSubgroups(groupCode?: string): Promise<ProfitSubgroup[]> {
    const qs = groupCode ? `?co_lin=${encodeURIComponent(groupCode)}` : '';
    return api.get<ProfitSubgroup[]>(`/api/v1/profit/subgroups${qs}`);
  },

  async getCategories(): Promise<ProfitCategory[]> {
    return api.get<ProfitCategory[]>('/api/v1/profit/categories');
  },

  async getBrands(): Promise<ProfitBrand[]> {
    return api.get<ProfitBrand[]>('/api/v1/profit/brands');
  },
};
