// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProfitCatalogos } from './useProfitCatalogos';
import { apiCatalogEffectiveService } from '../servicios/api/api-catalog-effective-service';
import { apiProfitCatalogService } from '../servicios/api/api-profit-service';

vi.mock('../servicios/api/api-catalog-effective-service', () => ({
  apiCatalogEffectiveService: {
    groups: vi.fn(), subgroups: vi.fn(), categories: vi.fn(), brands: vi.fn(),
    units: vi.fn(), taxTypes: vi.fn(), articleTypes: vi.fn(),
  },
}));
vi.mock('../servicios/api/api-profit-service', () => ({
  apiProfitCatalogService: { getLineDefaultType: vi.fn() },
}));

const env = (items: any[]): any => ({
  items, total: items.length, mode: 'SELECTED', source: 'PROFIT_LIVE', synchronizedAt: null,
});

describe('useProfitCatalogos (CAT: catálogo efectivo)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (apiCatalogEffectiveService.groups as any).mockResolvedValue(env([
      { code: 'AGR', description: 'INSUMOS AGRICOLA', parentCode: '', visible: true, availableInProfit: true, isNew: false, synchronizedAt: null },
    ]));
    (apiCatalogEffectiveService.subgroups as any).mockResolvedValue(env([
      { code: 'HER', description: 'HERBICIDAS', parentCode: 'AGR', visible: true, availableInProfit: true, isNew: false, synchronizedAt: null },
    ]));
    (apiCatalogEffectiveService.categories as any).mockResolvedValue(env([]));
    (apiCatalogEffectiveService.brands as any).mockResolvedValue(env([]));
    (apiCatalogEffectiveService.units as any).mockResolvedValue(env([]));
    (apiCatalogEffectiveService.taxTypes as any).mockResolvedValue(env([]));
    (apiCatalogEffectiveService.articleTypes as any).mockResolvedValue(env([
      { code: 'C', description: 'Consumo', parentCode: '', visible: true, availableInProfit: true, isNew: false, synchronizedAt: null, extra: { functional: true, usageCount: 3 } },
    ]));
    (apiProfitCatalogService.getLineDefaultType as any).mockResolvedValue({ groupCode: 'AGR', defaultType: null });
  });

  it('mapea el efectivo a formas Profit y propaga companyId', async () => {
    const { result } = renderHook(() => useProfitCatalogos('AGR', 'c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiCatalogEffectiveService.groups).toHaveBeenCalledWith('c1');
    expect(apiCatalogEffectiveService.subgroups).toHaveBeenCalledWith('c1', 'AGR');
    expect(result.current.grupos).toEqual([{ co_lin: 'AGR', lin_des: 'INSUMOS AGRICOLA' }]);
    expect(result.current.subgrupos).toEqual([{ co_lin: 'AGR', co_subl: 'HER', subl_des: 'HERBICIDAS' }]);
    expect(result.current.tipos).toEqual([{ code: 'C', label: 'Consumo', functional: true, usageCount: 3 }]);
    expect(result.current.error).toBeNull();
  });

  it('error preciso si el efectivo falla', async () => {
    (apiCatalogEffectiveService.groups as any).mockRejectedValue(new Error('No fue posible consultar el catálogo de Profit.'));
    const { result } = renderHook(() => useProfitCatalogos(undefined, 'c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toMatch(/No fue posible consultar/);
    expect(result.current.grupos).toEqual([]);
  });
});
