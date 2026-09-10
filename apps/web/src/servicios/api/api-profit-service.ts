import { api } from './api-client';

export interface ProfitAccount {
  code: string;
  description: string;
}

export interface ProfitGroupStandardPosition {
  position: string;
  code: string;
  description: string;
  inCatalog: boolean;
}

export interface ProfitGroupStandard {
  groupCode: string;
  configured: boolean;
  positions: ProfitGroupStandardPosition[];
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

  async getGroupStandard(groupCode: string): Promise<ProfitGroupStandard> {
    return api.get<ProfitGroupStandard>(`/api/v1/profit/groups/${encodeURIComponent(groupCode)}/standard`);
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

export interface ProfitUnit {
  co_uni: string;
  des_uni: string;
}

/** Tipo de artículo Profit: código real + etiqueta visible (14C-FORM §5). */
export interface ProfitArticleType {
  code: string;
  label: string;
  functional: boolean;
  usageCount: number;
}

export interface ProfitTaxType {
  tipo: string;
  descripcio: string;
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

  async getUnits(): Promise<ProfitUnit[]> {
    return api.get<ProfitUnit[]>('/api/v1/profit/units');
  },

  /** Tipos desde Profit (CHECK CK_art_TIPO + uso real). Nunca lista manual. */
  async getArticleTypes(): Promise<ProfitArticleType[]> {
    return api.get<ProfitArticleType[]>('/api/v1/profit/article-types');
  },

  /** Tipo dominante de la línea como sugerencia de default (no impone). */
  async getLineDefaultType(groupCode: string): Promise<{ groupCode: string; defaultType: string | null }> {
    return api.get(`/api/v1/profit/groups/${encodeURIComponent(groupCode)}/default-type`);
  },

  /** Tasas desde tabulado. No usar co_imp. */
  async getTaxTypes(): Promise<ProfitTaxType[]> {
    return api.get<ProfitTaxType[]>('/api/v1/profit/tax-types');
  },
};
