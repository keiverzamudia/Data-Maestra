import { api } from './api-client';
import type { EffectiveItem } from './api-catalog-effective-service';

/** Vista administrativa de un catálogo (todos, con banderas). */
export interface AdminCatalogView {
  items: EffectiveItem[];
  total: number;
  page: number;
  limit: number;
  mode: 'ALL' | 'SELECTED';
  source: 'PROFIT_LIVE' | 'PROFIT_SNAPSHOT';
  synchronizedAt: string | null;
}

export type CatalogTypeKey =
  | 'GROUP' | 'SUBGROUP' | 'CATEGORY' | 'BRAND' | 'UNIT' | 'TAX' | 'ARTICLE_TYPE';

function withCompany(companyId?: string, extra?: Record<string, string>): string {
  const sp = new URLSearchParams();
  if (companyId) sp.set('companyId', companyId);
  for (const [k, v] of Object.entries(extra ?? {})) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Administración de visibilidad (ADMIN.MANAGE en backend). */
export const apiCatalogConfigService = {
  view(
    type: CatalogTypeKey,
    opts: { companyId?: string; search?: string; page?: number; limit?: number } = {},
  ): Promise<AdminCatalogView> {
    return api.get<AdminCatalogView>(
      `/api/v1/catalog-config/${type}${withCompany(opts.companyId, {
        ...(opts.search ? { search: opts.search } : {}),
        ...(opts.page ? { page: String(opts.page) } : {}),
        ...(opts.limit ? { limit: String(opts.limit) } : {}),
      })}`,
    );
  },

  setMode(type: CatalogTypeKey, mode: 'ALL' | 'SELECTED', companyId?: string): Promise<unknown> {
    return api.put(`/api/v1/catalog-config/${type}/mode`, { mode, companyId });
  },

  setItems(
    type: CatalogTypeKey,
    codes: Array<{ code: string; parentCode?: string }>,
    visible: boolean,
    companyId?: string,
  ): Promise<{ updated: number }> {
    return api.put(`/api/v1/catalog-config/${type}/items`, { codes, visible, companyId });
  },

  sync(type: CatalogTypeKey): Promise<{ total: number; created: number; updated: number; unavailable: number }> {
    return api.post(`/api/v1/catalog-config/${type}/sync`, {});
  },
};
