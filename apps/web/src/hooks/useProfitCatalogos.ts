import * as React from 'react';
import {
  apiProfitCatalogService,
  type ProfitBrand,
  type ProfitCategory,
  type ProfitGroup,
  type ProfitSubgroup,
} from '../servicios/api/api-profit-service';

interface ProfitCatalogosState {
  grupos: ProfitGroup[];
  subgrupos: ProfitSubgroup[];
  categorias: ProfitCategory[];
  marcas: ProfitBrand[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Catálogos de clasificación directos desde Profit (FASE 8F).
 * El subgrupo se filtra por grupo seleccionado (código compuesto
 * co_lin + co_subl en Profit); categoría y marca son independientes.
 */
export function useProfitCatalogos(selectedGroupCode?: string) {
  const [state, setState] = React.useState<Omit<ProfitCatalogosState, 'reload'>>({
    grupos: [],
    subgrupos: [],
    categorias: [],
    marcas: [],
    loading: true,
    error: null,
  });
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [grupos, subgrupos, categorias, marcas] = await Promise.all([
          apiProfitCatalogService.getGroups(),
          apiProfitCatalogService.getSubgroups(selectedGroupCode),
          apiProfitCatalogService.getCategories(),
          apiProfitCatalogService.getBrands(),
        ]);
        if (!cancelled) {
          setState({ grupos, subgrupos, categorias, marcas, loading: false, error: null });
        }
      } catch (err: any) {
        if (!cancelled) {
          setState(prev => ({ ...prev, loading: false, error: err?.message || 'Error al cargar catálogos de Profit' }));
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [selectedGroupCode, nonce]);

  return { ...state, reload: () => setNonce(n => n + 1) };
}
