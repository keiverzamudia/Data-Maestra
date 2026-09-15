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
import { apiCatalogEffectiveService } from '../servicios/api/api-catalog-effective-service';

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
 * Catálogos de clasificación (FASE 8F + 14C-FORM + CAT).
 * Fuente única: catálogo efectivo Data-Maestra (Profit × visibilidad),
 * con la misma forma que los endpoints Profit directos.
 * El subgrupo se filtra por grupo seleccionado (código compuesto
 * co_lin + co_subl en Profit); categoría y marca son independientes.
 */
export function useProfitCatalogos(selectedGroupCode?: string, companyId?: string) {
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
          apiCatalogEffectiveService.groups(companyId).then(e => e.items.map(i => ({ co_lin: i.code, lin_des: i.description }))),
          apiCatalogEffectiveService.subgroups(companyId, selectedGroupCode).then(e => e.items.map(i => ({ co_lin: i.parentCode, co_subl: i.code, subl_des: i.description }))),
          apiCatalogEffectiveService.categories(companyId).then(e => e.items.map(i => ({ co_cat: i.code, cat_des: i.description }))),
          apiCatalogEffectiveService.brands(companyId).then(e => e.items.map(i => ({ co_col: i.code, des_col: i.description }))),
          apiCatalogEffectiveService.articleTypes(companyId).then(e => e.items.map(i => ({
            code: i.code,
            label: i.description,
            functional: (i.extra?.functional as boolean) ?? true,
            usageCount: (i.extra?.usageCount as number) ?? 0,
          }))),
          apiCatalogEffectiveService.taxTypes(companyId).then(e => e.items.map(i => ({ tipo: i.code, descripcio: i.description }))),
          apiCatalogEffectiveService.units(companyId).then(e => e.items.map(i => ({ co_uni: i.code, des_uni: i.description }))),
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
  }, [selectedGroupCode, companyId, nonce]);

  return { ...state, reload: () => setNonce(n => n + 1) };
}
