import * as React from 'react';
import { apiAuditService, type AuditEntry, type AuditQuery } from '../../servicios/api/api-audit-service';
import { useSession } from '../../contextos/SessionContext';
import { Page, Input, Button, Badge, EmptyState, Skeleton,
ErrorState, Field, Drawer } from '../../componentes/ui';
import { getAuditActionLabel } from '../../utilidades/presentacion';

const SENSITIVE_KEYS = /password|passwd|pwd|secret|token|cookie|session|hash|credential|private|initial/i;

/** Redacta valores sensibles antes de mostrar contexto (solo presentación). */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SENSITIVE_KEYS.test(k) ? '[OCULTO]' : redact(v),
      ]),
    );
  }
  return value;
}

function pretty(raw: unknown): string {
  if (raw === null || raw === undefined) return '—';
  const shown = redact(typeof raw === 'string' ? safeParse(raw) : raw);
  return JSON.stringify(shown, null, 2);
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function actionTone(action: string): 'green' | 'yellow' | 'red' | 'blue' | 'gray' {
  if (/FAILED|ERROR|DENEGAD|RECHAZADO/.test(action)) return 'red';
  if (/EXITOSO|GRANTED|CREAD[OA]|ACTIVAT|COMPLET/.test(action)) return 'green';
  if (/RESET|REMOVED|REVOCAD|REMOVE|DEVUELTO/.test(action)) return 'yellow';
  if (/SYNC|LOGIN|SESSION|LOGOUT/.test(action)) return 'blue';
  return 'gray';
}

/** 10K — Auditoría real: API server-side con filtros, paginación y detalle. Solo AUDIT.VIEW. */
export const AuditPage: React.FC = () => {
  const { hasPermission } = useSession();
  const canAudit = hasPermission('AUDIT.VIEW');
  const [events, setEvents] = React.useState<AuditEntry[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<AuditEntry | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  // Filtros controlados (se aplican con el botón Buscar).
  const [search, setSearch] = React.useState('');
  const [action, setAction] = React.useState('');
  const [actorId, setActorId] = React.useState('');
  const [entityId, setEntityId] = React.useState('');
  const [correlationId, setCorrelationId] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');

  const load = React.useCallback(async (p: number, q: AuditQuery) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiAuditService.getEvents({ ...q, page: p, limit: 20 });
      setEvents(res.data as AuditEntry[]);
      setTotal(res.total);
      setPage(res.page ?? p);
      setTotalPages(res.totalPages ?? 1);
    } catch (err: any) {
      setEvents([]);
      setError(err?.message || 'No se pudo cargar la auditoría.');
    } finally {
      setLoading(false);
    }
  }, []);

  const currentQuery = React.useCallback((): AuditQuery => ({
    search: search.trim() || undefined,
    action: action.trim() || undefined,
    actorId: actorId.trim() || undefined,
    entityId: entityId.trim() || undefined,
    correlationId: correlationId.trim() || undefined,
    from: from || undefined,
    to: to || undefined,
  }), [search, action, actorId, entityId, correlationId, from, to]);

  React.useEffect(() => {
    if (!canAudit) {
      setLoading(false);
      return;
    }
    void load(1, {});
  }, [canAudit, load]);

  const apply = () => void load(1, currentQuery());
  const goPage = (p: number) => {
    if (p < 1 || p > totalPages || p === page) return;
    void load(p, currentQuery());
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      setSelected(await apiAuditService.getById!(id));
    } catch (err: any) {
      setError(err?.message || 'No se pudo cargar el detalle.');
    } finally {
      setDetailLoading(false);
    }
  };

  const actorName = (e: AuditEntry) => e.actor?.displayName || e.actorId || 'Sistema';
  const affectedName = (e: AuditEntry) => {
    if (e.afectado) return e.afectado.displayName;
    if (e.entityType === 'User') return e.entityId;
    return 'No aplica';
  };

  if (!canAudit) {
    return (
      <Page title="Auditoría" desc="Consulta las acciones registradas en el sistema.">
        <p className="muted">Sin permiso para consultar auditoría. Se requiere AUDIT.VIEW.</p>
      </Page>
    );
  }

  const activeFilters = [search, action, actorId, entityId, correlationId, from, to].filter(v => v.trim() !== '').length;
  const clearFilters = () => {
    setSearch('');
    setAction('');
    setActorId('');
    setEntityId('');
    setCorrelationId('');
    setFrom('');
    setTo('');
    void load(1, {});
  };

  return (
    <Page title="Auditoría" desc="Consulta las acciones registradas en el sistema.">
      <details className="card p16">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          Filtros{activeFilters > 0 ? ` (${activeFilters} activos)` : ''}
        </summary>
        <div className="toolbar" style={{ marginTop: 8 }} role="search">
          <Field label="Búsqueda"><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Búsqueda general..." autoComplete="off" aria-label="Búsqueda" /></Field>
          <Field label="Acción"><Input value={action} onChange={e => setAction(e.target.value)} placeholder="Acción..." autoComplete="off" aria-label="Acción" /></Field>
          <Field label="Actor"><Input value={actorId} onChange={e => setActorId(e.target.value)} placeholder="Actor (id)..." autoComplete="off" aria-label="Actor" /></Field>
          <Field label="Afectado"><Input value={entityId} onChange={e => setEntityId(e.target.value)} placeholder="Afectado (id)..." autoComplete="off" aria-label="Afectado" /></Field>
          <Field label="Correlation ID"><Input value={correlationId} onChange={e => setCorrelationId(e.target.value)} placeholder="Correlation ID..." autoComplete="off" aria-label="Correlation ID" /></Field>
          <Field label="Desde"><Input type="date" value={from} onChange={e => setFrom(e.target.value)} aria-label="Desde" /></Field>
          <Field label="Hasta"><Input type="date" value={to} onChange={e => setTo(e.target.value)} aria-label="Hasta" /></Field>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <Button onClick={apply} disabled={loading}>Buscar</Button>
            {activeFilters > 0 && <Button variant="secondary" onClick={clearFilters}>Limpiar</Button>}
          </div>
        </div>
      </details>

      {loading && (
        <div className="card p16 stack-sm" aria-label="Cargando auditoría">
          <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} />
        </div>
      )}
      {!loading && error && (
        <ErrorState title="No pudimos cargar la auditoría." desc={error} onRetry={apply} />
      )}
      {!loading && !error && events.length === 0 && (
        <EmptyState title="Sin eventos" desc="No hay eventos que coincidan con los filtros." />
      )}
      {!loading && !error && events.length > 0 && (
        <div className="stack-sm">
          <div className="summary-strip" aria-label="Resumen de auditoría">
            <div className="summary-item"><div className="summary-num">{total}</div><div className="summary-label">Eventos</div></div>
            <div className="summary-item"><div className="summary-num">{events.length}</div><div className="summary-label">En esta página</div></div>
          </div>
          <div className="card table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Actor</th>
                  <th>Acción</th>
                  <th>Afectado</th>
                  <th>Módulo</th>
                  <th>Correlation ID</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id}>
                    <td data-label="Fecha" className="muted small">{new Date(ev.createdAt).toLocaleString('es-VE')}</td>
                    <td data-label="Actor"><strong>{actorName(ev)}</strong></td>
                    <td data-label="Acción"><Badge tone={actionTone(ev.action)}>{getAuditActionLabel(ev.action)}</Badge></td>
                    <td data-label="Afectado">{affectedName(ev)}</td>
                    <td data-label="Módulo" className="cell-secondary">{ev.entityType}</td>
                    <td data-label="Correlation ID"><code className="code" style={{ fontSize: 11, padding: '2px 6px' }}>{ev.correlationId?.slice(0, 8) ?? '—'}</code></td>
                    <td data-label="Detalle"><Button size="sm" variant="secondary" onClick={() => void openDetail(ev.id)}>Ver</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => goPage(page - 1)}>Anterior</Button>
            <span className="muted small">Página {page} de {totalPages} ({total} eventos)</span>
            <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => goPage(page + 1)}>Siguiente</Button>
          </div>
        </div>
      )}

      <Drawer open={!!selected || detailLoading} onClose={() => setSelected(null)} title={selected ? getAuditActionLabel(selected.action) : 'Detalle de evento'}>
        {detailLoading && !selected && <span className="muted small">Cargando detalle...</span>}
        {selected && (
          <div className="stack-sm">
            <div className="card p16">
              <Badge tone={actionTone(selected.action)}>{getAuditActionLabel(selected.action)}</Badge>
              <div className="review-grid" style={{ marginTop: 8 }}>
                <div><span className="muted small">Fecha</span><br />{new Date(selected.createdAt).toLocaleString('es-VE')}</div>
                <div><span className="muted small">Actor</span><br /><strong>{actorName(selected)}</strong></div>
                <div><span className="muted small">Afectado</span><br /><strong>{affectedName(selected)}</strong></div>
                <div><span className="muted small">Módulo/Recurso</span><br />{selected.entityType}</div>
                <div><span className="muted small">Correlation ID</span><br /><code>{selected.correlationId}</code></div>
              </div>
            </div>
            <div>
              <span className="muted small">Contexto</span>
              <pre className="code" style={{ marginTop: 4 }}>{pretty(selected.afterData ?? selected.beforeData)}</pre>
              <p className="muted small" style={{ marginTop: 4 }}>Los valores sensibles se muestran como [OCULTO].</p>
            </div>
            <Button variant="secondary" onClick={() => setSelected(null)}>Cerrar</Button>
          </div>
        )}
      </Drawer>
    </Page>
  );
};
