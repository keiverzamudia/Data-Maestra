// Lógica pura de paginación del selector contable (Fase 8E.6.1).
// El backend garantiza códigos únicos (C_DIST.dbo.sccuenta, co_cue único
// verificado), pero las respuestas pueden llegar desordenadas entre
// generaciones de búsqueda: aquí se resuelven de forma determinista.

export interface AccountPageItem {
  code: string;
  description: string;
}

export interface AccountListState {
  items: AccountPageItem[];
  /** Próximo offset a pedir para la búsqueda vigente. */
  nextOffset: number;
  /** true si la última página vino llena (puede haber más). */
  hasMore: boolean;
  /** Generación de búsqueda vigente (se incrementa en cada búsqueda). */
  generation: number;
  query: string;
}

export const PAGE_SIZE = 20;

export function initialAccountList(): AccountListState {
  return { items: [], nextOffset: 0, hasMore: false, generation: 0, query: '' };
}

/**
 * Primera página de una búsqueda (nueva generación): reemplaza todo.
 * La generación la asigna quien dispara la búsqueda (un contador propio),
 * de modo que las respuestas tardías de generaciones anteriores se descartan.
 */
export function applyFirstPage(
  _prev: AccountListState,
  query: string,
  rows: AccountPageItem[],
  generation: number,
): AccountListState {
  return {
    items: dedupeByCode(rows),
    nextOffset: rows.length,
    hasMore: rows.length === PAGE_SIZE,
    generation,
    query,
  };
}

/**
 * Página siguiente: solo se acepta si pertenece a la generación vigente
 * Y el offset coincide con el esperado. En cualquier otro caso se descarta
 * (evita duplicados por respuestas tardías y huecos por offsets obsoletos).
 */
export function applyNextPage(
  prev: AccountListState,
  rows: AccountPageItem[],
  offset: number,
  generation: number,
): AccountListState {
  if (generation !== prev.generation || offset !== prev.nextOffset) {
    return prev;
  }
  return {
    ...prev,
    items: dedupeByCode([...prev.items, ...rows]),
    nextOffset: prev.nextOffset + rows.length,
    hasMore: rows.length === PAGE_SIZE,
  };
}

/** Primera ocurrencia gana; orden estable. Con códigos únicos no pierde nada. */
export function dedupeByCode(items: AccountPageItem[]): AccountPageItem[] {
  const seen = new Set<string>();
  const out: AccountPageItem[] = [];
  for (const it of items) {
    if (seen.has(it.code)) continue;
    seen.add(it.code);
    out.push(it);
  }
  return out;
}
