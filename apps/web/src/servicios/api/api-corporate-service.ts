import { api } from './api-client';

/**
 * FASE 27 — Empresas Profit descubiertas en vivo desde
 * `AD_GRUP.dbo.TEmpresas`. Se eliminó la configuración local de empresas y
 * las equivalencias; esta capa solo expone el descubrimiento (solo lectura).
 */
export interface CorporateCompany {
  code: string;
  name: string;
  isStandard: boolean;
  enabled?: boolean;
}

export const apiCorporateService = {
  async companies(): Promise<CorporateCompany[]> {
    return api.get<CorporateCompany[]>('/api/v1/profit/multi-company/companies');
  },
};
