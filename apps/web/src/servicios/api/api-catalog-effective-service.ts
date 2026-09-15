import { api } from './api-client';

/** Ítem del catálogo efectivo: Profit × visibilidad Data-Maestra (FASE CAT). */
export interface EffectiveItem {
  code: string;
  description: string;
  parentCode: string;
  visible: boolean;
  availableInProfit: boolean;
  isNew: boolean;
  synchronizedAt: string | null;
  extra?: Record<string, unknown>;
}

export interface EffectiveEnvelope {
  items: EffectiveItem[];
  total: number;
  mode: 'ALL' | 'SELECTED';
  source: 'PROFIT_LIVE' | 'PROFIT_SNAPSHOT';
  synchronizedAt: string | null;
}

function qs(companyId?: string, extra?: Record<string, string>): string {
  const sp = new URLSearchParams();
  if (companyId) sp.set('companyId', companyId);
  for (const [k, v] of Object.entries(extra ?? {})) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** Catálogo efectivo (una sola fuente para selectores operativos). */
export const apiCatalogEffectiveService = {
  groups(companyId?: string): Promise<EffectiveEnvelope> {
    return api.get<EffectiveEnvelope>(`/api/v1/catalogs/effective/groups${qs(companyId)}`);
  },
  subgroups(companyId?: string, groupCode?: string): Promise<EffectiveEnvelope> {
    return api.get<EffectiveEnvelope>(
      `/api/v1/catalogs/effective/subgroups${qs(companyId, groupCode ? { groupCode } : undefined)}`,
    );
  },
  categories(companyId?: string): Promise<EffectiveEnvelope> {
    return api.get<EffectiveEnvelope>(`/api/v1/catalogs/effective/categories${qs(companyId)}`);
  },
  brands(companyId?: string): Promise<EffectiveEnvelope> {
    return api.get<EffectiveEnvelope>(`/api/v1/catalogs/effective/brands${qs(companyId)}`);
  },
  units(companyId?: string): Promise<EffectiveEnvelope> {
    return api.get<EffectiveEnvelope>(`/api/v1/catalogs/effective/units${qs(companyId)}`);
  },
  taxTypes(companyId?: string): Promise<EffectiveEnvelope> {
    return api.get<EffectiveEnvelope>(`/api/v1/catalogs/effective/tax-types${qs(companyId)}`);
  },
  articleTypes(companyId?: string): Promise<EffectiveEnvelope> {
    return api.get<EffectiveEnvelope>(`/api/v1/catalogs/effective/article-types${qs(companyId)}`);
  },
};
