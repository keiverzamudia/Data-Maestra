import * as React from 'react';
import { apiCatalogoService } from '../servicios/api/api-catalogo-service';
import type { CatalogGroup, CatalogSubgroup, CatalogCategory, Brand, UnitOfMeasure } from '../tipos';

interface CatalogosState {
  grupos: CatalogGroup[];
  subgrupos: CatalogSubgroup[];
  categorias: CatalogCategory[];
  marcas: Brand[];
  unidades: UnitOfMeasure[];
  loading: boolean;
  error: string | null;
}

export function useCatalogos() {
  const [state, setState] = React.useState<CatalogosState>({
    grupos: [],
    subgrupos: [],
    categorias: [],
    marcas: [],
    unidades: [],
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [grupos, subgrupos, categorias, categoriasProfit, marcas, unidades] = await Promise.all([
          apiCatalogoService.getGrupos(),
          apiCatalogoService.getSubgrupos(),
          apiCatalogoService.getCategorias(),
          apiCatalogoService.getCategoriasProfit(),
          apiCatalogoService.getMarcas(),
          apiCatalogoService.getUnidades(),
        ]);
        const todasCategorias = [...categorias, ...categoriasProfit];

        if (!cancelled) {
          setState({ grupos, subgrupos, categorias: todasCategorias, marcas, unidades, loading: false, error: null });
        }
      } catch (err: any) {
        if (!cancelled) {
          setState(prev => ({ ...prev, loading: false, error: err?.message || 'Error al cargar catálogos' }));
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return state;
}
