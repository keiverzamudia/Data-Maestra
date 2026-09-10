import * as React from 'react';
import {
  apiProfitCatalogService,
  type ProfitArticleType,
  type ProfitBrand,
  type ProfitCategory,
  type ProfitGroup,
  type ProfitSubgroup,
  type ProfitTaxType,
  type ProfitUnit,
} from '../servicios/api/api-profit-service';

interface ProfitCatalogosState {
  grupos: ProfitGroup[];
  subgrupos: ProfitSubgroup[];
  categorias: ProfitCategory[];
  marcas: ProfitBrand[];
  /** Tipos desde Profit (CHECK CK_art_TIPO + uso). Nunca lista manual. */
  tipos: ProfitArticleType[];
  tasas: ProfitTaxType[];
  unidadesProfit: ProfitUnit[];
  /** Tipo dominante de la línea como sugerencia (null si Profit no responde). */
  defaultType: string | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Catálogos de clasificación directos desde Profit (FASE 8F + 14C-FORM).
 * El subgrupo se filtra por grupo seleccionado (código compuesto
 * co_lin + co_subl en Profit); categoría y marca son independientes.
 */
export function useProfitCatalogos(selectedGroupCode?: string) {
  const [state, setState] = React.useState<Omit<ProfitCatalogosState, 'reload'>>({
    grupos: [],
    subgrupos: [],
    categorias: [],
    marcas: [],
    tipos: [],
    tasas: [],
    unidadesProfit: [],
    defaultType: null,
    loading: true,
    error: null,
  });
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [grupos, subgrupos, categorias, marcas, tipos, tasas, unidadesProfit, defaultTypeRes] = await Promise.all([
          apiProfitCatalogService.getGroups(),
          apiProfitCatalogService.getSubgroups(selectedGroupCode),
          apiProfitCatalogService.getCategories(),
          apiProfitCatalogService.getBrands(),
          apiProfitCatalogService.getArticleTypes(),
          apiProfitCatalogService.getTaxTypes(),
          apiProfitCatalogService.getUnits(),
          // Sugerencia de default por línea; si falla, el resto sigue válido.
          selectedGroupCode
            ? apiProfitCatalogService.getLineDefaultType(selectedGroupCode).catch(() => ({ defaultType: null as string | null }))
            : Promise.resolve({ defaultType: null as string | null }),
        ]);
        if (!cancelled) {
          setState({ grupos, subgrupos, categorias, marcas, tipos, tasas, unidadesProfit, defaultType: defaultTypeRes.defaultType ?? null, loading: false, error: null });
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
