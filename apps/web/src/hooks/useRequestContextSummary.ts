import * as React from 'react';
import { apiGetRequestContextSummary } from '../servicios/api/api-request-summary-service';
import type { RequestContextSummary } from '../tipos';

/** Evento emitido por useNotifications (SSE) para refrescar contadores. */
export const COUNTERS_REFRESH_EVENT = 'dm:counters-refresh';

export interface RequestContextSummaryState {
  summary: RequestContextSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * FASE — Carga el resumen contextual una vez y lo refresca cuando el SSE
 * de notificaciones señala una transición de workflow. Sin polling.
 * Evita requests duplicados: un solo listener + un solo fetch en vuelo.
 */
export function useRequestContextSummary(): RequestContextSummaryState {
  const [summary, setSummary] = React.useState<RequestContextSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const inflight = React.useRef(false);
  const mounted = React.useRef(true);

  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = React.useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const data = await apiGetRequestContextSummary();
      if (!mounted.current) return;
      setSummary(data);
      setError(null);
    } catch {
      if (!mounted.current) return;
      setError('No pudimos cargar los contadores.');
      // No inventar 0 en error: se conserva el último summary válido si existe.
    } finally {
      inflight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Refresco por SSE (transiciones de workflow) — sin polling agresivo.
  React.useEffect(() => {
    const onRefresh = () => { void load(); };
    window.addEventListener(COUNTERS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(COUNTERS_REFRESH_EVENT, onRefresh);
  }, [load]);

  return { summary, loading, error, refresh: () => { setLoading(true); void load(); } };
}
