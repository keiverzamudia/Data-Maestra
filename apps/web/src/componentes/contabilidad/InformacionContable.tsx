import * as React from 'react';
import { Button, Input } from '../ui';
import { serializarDis, type ContabilidadPosition } from '../../utilidades/dis';
import { apiProfitService, type ProfitAccount } from '../../servicios/api/api-profit-service';
import {
  PAGE_SIZE,
  applyFirstPage,
  applyNextPage,
  initialAccountList,
  type AccountListState,
} from '../../utilidades/account-pages';

export type PositionKey = `c${ContabilidadPosition}`;

export interface ContabilidadEntry {
  position: PositionKey;
  code: string;
  description: string;
}

export const POSITION_KEYS: PositionKey[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10'];

function positionNumber(key: PositionKey): ContabilidadPosition {
  return parseInt(key.slice(1), 10) as ContabilidadPosition;
}

interface Props {
  value: ContabilidadEntry[];
  onChange: (next: ContabilidadEntry[]) => void;
}

/**
 * Información Contable (Fase 8E/8E.6) — pestañas 01..10, una cuenta por posición.
 * Catálogo maestro: C_DIST.dbo.sccuenta vía GET /profit/accounts con búsqueda
 * server-side (código o nombre, parcial) y scroll progresivo (20 por página).
 * El DIS es la representación serializada para la integración futura con Profit;
 * no se copia ni edita manualmente. Solo lectura: no crea ni edita cuentas.
 */
export const InformacionContable: React.FC<Props> = ({ value, onChange }) => {
  const [active, setActive] = React.useState<PositionKey>('c1');
  const [search, setSearch] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [list, setList] = React.useState<AccountListState>(() => initialAccountList());
  const [loading, setLoading] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Generación vigente y próximo offset: solo avanzan con respuestas válidas.
  // Así una respuesta tardía u obsoleta nunca mezcla, duplica ni salta páginas.
  const genRef = React.useRef(0);
  const offsetRef = React.useRef(0);

  const byPosition = React.useMemo(() => new Map(value.map(e => [e.position, e])), [value]);
  const current = byPosition.get(active);
  const results = list.items;
  const hasMore = list.hasMore;

  const doSearch = React.useCallback(async (query: string) => {
    const gen = ++genRef.current;
    offsetRef.current = 0;
    setLoading(true);
    setError(null);
    try {
      const rows = await apiProfitService.getAccounts(query || undefined, PAGE_SIZE, 0);
      if (genRef.current !== gen) return; // búsqueda más nueva en curso
      offsetRef.current = rows.length;
      setList(prev => applyFirstPage(prev, query, rows, gen));
    } catch (err: any) {
      if (genRef.current !== gen) return;
      setError(err?.message || 'Error al cargar cuentas');
      setList(prev => applyFirstPage(prev, query, [], gen));
    } finally {
      if (genRef.current === gen) setLoading(false);
    }
  }, []);

  // Búsqueda con debounce (300 ms); primer lote: 20 registros.
  React.useEffect(() => {
    const t = setTimeout(() => { void doSearch(search.trim()); }, 300);
    return () => clearTimeout(t);
  }, [search, doSearch]);

  const loadMore = React.useCallback(() => {
    if (loadingMore || loading || !list.hasMore) return;
    const gen = genRef.current;
    const offset = offsetRef.current;
    const query = list.query;
    setLoadingMore(true);
    void (async () => {
      try {
        const rows = await apiProfitService.getAccounts(query || undefined, PAGE_SIZE, offset);
        if (genRef.current !== gen) return; // otra búsqueda tomó el control
        const prevOffset = offsetRef.current;
        if (offset !== prevOffset) return; // página ya cargada o reiniciada
        offsetRef.current = offset + rows.length;
        setList(prev => applyNextPage(prev, rows, offset, gen));
      } catch (err: any) {
        if (genRef.current !== gen) return;
        setError(err?.message || 'Error al cargar más cuentas');
      } finally {
        if (genRef.current === gen) setLoadingMore(false);
      }
    })();
  }, [list, loading, loadingMore]);

  const handleScroll = (e: React.UIEvent<HTMLUListElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) loadMore();
  };

  const usedElsewhere = React.useCallback(
    (code: string, except: PositionKey) => value.find(e => e.position !== except && e.code === code),
    [value],
  );

  const selectAccount = (a: ProfitAccount) => {
    const entry: ContabilidadEntry = { position: active, code: a.code, description: a.description };
    const next = value.filter(e => e.position !== active);
    next.push(entry);
    next.sort((x, y) => positionNumber(x.position) - positionNumber(y.position));
    onChange(next);
    setSearch('');
    setOpen(false);
  };

  const removeCurrent = () => {
    onChange(value.filter(e => e.position !== active));
  };

  const retry = () => {
    void doSearch(search.trim());
  };

  const dis = React.useMemo(() => {
    try {
      return serializarDis(value.map(e => ({ position: positionNumber(e.position), code: e.code })));
    } catch {
      return '<DIS></DIS>';
    }
  }, [value]);

  const duplicate = current ? usedElsewhere(current.code, active) : undefined;

  return (
    <div className="stack-sm">
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} role="tablist" aria-label="Posiciones contables c1 a c10">
        {POSITION_KEYS.map(k => {
          const has = byPosition.has(k);
          const num = k.slice(1).padStart(2, '0');
          return (
            <button
              key={k}
              role="tab"
              aria-selected={active === k}
              title={has ? `Posición ${num} con cuenta` : `Posición ${num} vacía`}
              onClick={() => { setActive(k); setSearch(''); setOpen(false); }}
              className={`tab ${active === k ? 'tab-active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <span aria-hidden="true" style={{ fontWeight: 800, color: has ? '#16a34a' : '#94a3b8' }}>
                {has ? '●' : '○'}
              </span>
              {num}
            </button>
          );
        })}
      </div>

      <div className="card p16">
        <h4 style={{ fontSize: 14 }}>Carpeta {active.slice(1).padStart(2, '0')}</h4>

        <div style={{ marginTop: 8, position: 'relative' }}>
          <span className="muted small">Cuenta Contable (buscar por código o nombre)</span>
          <Input
            placeholder="Ej: 1.1.04 o inventario…"
            value={current ? `${current.code} — ${current.description}` : search}
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}
            aria-label={`Buscar cuenta para posición ${active}`}
          />
          {open && (
            <ul
              role="listbox"
              aria-label="Cuentas encontradas"
              onScroll={handleScroll}
              style={{
                position: 'absolute', zIndex: 20, left: 0, right: 0, marginTop: 4,
                background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
                maxHeight: 220, overflowY: 'auto', listStyle: 'none', padding: 4,
                boxShadow: '0 10px 30px rgba(0,0,0,.12)',
              }}
            >
              {loading && results.length === 0 && <li className="muted small" style={{ padding: 8 }}>Buscando en Profit…</li>}
              {error && (
                <li style={{ padding: 8 }}>
                  <div className="alert" style={{ background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>
                    No se pudieron cargar las cuentas de Profit: {error}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Button variant="secondary" size="sm" onClick={retry}>Reintentar</Button>
                  </div>
                </li>
              )}
              {!loading && !error && results.length === 0 && (
                <li className="muted small" style={{ padding: 8 }}>No hay coincidencias. No se pueden crear cuentas.</li>
              )}
              {results.map(a => (
                <li key={a.code}>
                  <button
                    role="option"
                    aria-selected={current?.code === a.code}
                    onClick={() => selectAccount(a)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                      border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer',
                    }}
                    onMouseEnter={e => ((e.currentTarget.style.background = '#eff6ff'))}
                    onMouseLeave={e => ((e.currentTarget.style.background = 'transparent'))}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{a.code}</div>
                    <div className="muted small">{a.description}</div>
                  </button>
                </li>
              ))}
              {loadingMore && <li className="muted small" style={{ padding: 8 }}>Cargando más…</li>}
            </ul>
          )}
        </div>

        {current && (
          <div style={{ marginTop: 12 }}>
            <div className="review-grid">
              <div><span className="muted small">Código</span><br /><strong style={{ fontFamily: 'monospace' }}>{current.code}</strong></div>
              <div><span className="muted small">Descripción</span><br /><strong>{current.description}</strong></div>
            </div>
            {duplicate && (
              <div className="alert" style={{ marginTop: 8 }}>
                ⚠ Esta cuenta ya está usada en {duplicate.position}. Cada posición debe tener su propia cuenta.
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <Button variant="ghost" size="sm" onClick={removeCurrent}>Quitar cuenta</Button>
            </div>
          </div>
        )}

        {!current && !loading && !error && (
          <p className="muted small" style={{ marginTop: 8 }}>Posición vacía. Seleccione una cuenta existente de la lista.</p>
        )}
      </div>

      <div className="card p16">
        <span className="muted small">Formato contable para Profit</span>
        <p className="muted small" style={{ marginTop: 4 }}>
          Representación generada automáticamente a partir de las cuentas seleccionadas.
        </p>
        <div className="code" style={{ marginTop: 8, wordBreak: 'break-all' }}>{dis}</div>
      </div>
    </div>
  );
};
