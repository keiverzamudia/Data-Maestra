import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { requestService } from '../../servicios';
import { useCompany } from '../../contextos/CompanyContext';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import {
  Page, StatusBadge, SearchInput, Select, DataTable, Pagination, StatCard, type DataColumn,
} from '../../componentes/ui';
import { etapaActual } from '../../utilidades/presentacion';
import type { Request } from '../../tipos';

type Filtro = 'todos' | 'proceso' | 'completadas' | 'rechazadas' | 'error';
type Orden = 'recientes' | 'antiguas' | 'actualizadas';

/** 14L — Bandeja personal: solo solicitudes creadas por el usuario (mine server-side). */
export const MisSolicitudesPage: React.FC = () => {
  const { companyId, companies } = useCompany();
  const { departamentos } = useOrganizacion(companyId);
  const navigate = useNavigate();
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [totals, setTotals] = React.useState({ total: 0, proceso: 0, completadas: 0, error: 0 });
  const [search, setSearch] = React.useState('');
  const [filtro, setFiltro] = React.useState<Filtro>('todos');
  const [orden, setOrden] = React.useState<Orden>('recientes');
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(25);
  const [totalPages, setTotalPages] = React.useState(1);
  const [filteredTotal, setFilteredTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const queryFor = React.useCallback((f: Filtro) => {
    const base: Record<string, unknown> = { mine: true };
    if (f === 'error') return { ...base, statuses: ['ERROR_PROFIT'] };
    if (f !== 'todos') return { ...base, bucket: f === 'rechazadas' ? 'rechazadas' : f };
    return base;
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const common = {
        companyId: companyId || undefined,
        search: search.trim() || undefined,
        sort: orden,
        page,
        limit,
      };
      const [list, proceso, completadas, conError] = await Promise.all([
        requestService.list({ ...common, ...queryFor(filtro) }),
        requestService.list({ mine: true, bucket: 'proceso', limit: 1 }),
        requestService.list({ mine: true, bucket: 'completadas', limit: 1 }),
        requestService.list({ mine: true, statuses: ['ERROR_PROFIT'], limit: 1 }),
      ]);
      setRequests(list.data);
      setFilteredTotal(list.filteredTotal ?? list.total);
      setTotalPages(Math.max(Math.ceil((list.filteredTotal ?? list.total) / (list.limit ?? limit)), 1));
      setTotals({
        total: list.total,
        proceso: proceso.filteredTotal ?? proceso.total,
        completadas: completadas.filteredTotal ?? completadas.total,
        error: conError.filteredTotal ?? conError.total,
      });
    } catch {
      setRequests([]);
      setError('No pudimos cargar tus solicitudes.');
    } finally {
      setLoading(false);
    }
  }, [companyId, search, orden, page, limit, filtro, queryFor]);

  React.useEffect(() => { void load(); }, [load]);

  const deptOf = (id: string) => departamentos.find(d => d.id === id)?.name ?? '—';
  const companyOf = (r: Request) => (r as Request & { company?: { name?: string } }).company?.name
    ?? companies.find(c => c.id === r.companyId)?.name ?? '—';

  const columns: DataColumn<Request>[] = [
    { key: 'num', header: '# Solicitud', label: '#', render: r => <strong>#{r.requestNumber}</strong> },
    { key: 'desc', header: 'Descripción', label: 'Descripción', render: r => <span className="ellipsis">{r.requestedDescription}</span> },
    { key: 'emp', header: 'Empresa', label: 'Empresa', render: r => companyOf(r) },
    { key: 'area', header: 'Área', label: 'Área', render: r => deptOf(r.departmentId) },
    { key: 'est', header: 'Estado actual', label: 'Estado', render: r => <StatusBadge status={r.status} /> },
    { key: 'cre', header: 'Creada', label: 'Creada', render: r => <span className="muted small">{new Date(r.createdAt).toLocaleDateString('es-VE')}</span> },
    { key: 'upd', header: 'Actualizada', label: 'Actualizada', render: r => <span className="muted small">{new Date(r.updatedAt).toLocaleDateString('es-VE')}</span> },
    { key: 'master', header: 'Código Master', label: 'Master', render: r => <span className="mono">{r.masterCode || '—'}</span> },
    { key: 'profit', header: 'Código Profit', label: 'Profit', render: r => <span className="mono">{r.profitCode || '—'}</span> },
    { key: 'acc', header: 'Acción', label: 'Acción', render: r => <span className="muted small">{etapaActual(r.status)}</span> },
  ];

  return (
    <Page title="Mis solicitudes" desc="Solicitudes creadas por mí.">
      <div className="stat-grid" aria-label="Resumen">
        <StatCard label="Total" value={totals.total} />
        <StatCard label="En proceso" value={totals.proceso} tone="info" />
        <StatCard label="Completadas" value={totals.completadas} tone="ok" />
        <StatCard label="Con error" value={totals.error} tone={totals.error > 0 ? 'bad' : undefined} />
      </div>

      <div className="toolbar" role="search">
        <span className="grow">
          <SearchInput
            value={search}
            onChange={v => { setSearch(v); setPage(1); }}
            placeholder="Buscar por número, descripción, master, profit o part number..."
          />
        </span>
        <Select value={filtro} onChange={e => { setFiltro(e.target.value as Filtro); setPage(1); }} aria-label="Filtrar por estado">
          <option value="todos">Todos los estados</option>
          <option value="proceso">En proceso</option>
          <option value="completadas">Completadas</option>
          <option value="rechazadas">Rechazadas</option>
          <option value="error">Con error</option>
        </Select>
        <Select value={orden} onChange={e => { setOrden(e.target.value as Orden); setPage(1); }} aria-label="Ordenar">
          <option value="recientes">Más recientes</option>
          <option value="antiguas">Más antiguas</option>
          <option value="actualizadas">Última actualización</option>
        </Select>
      </div>

      <DataTable<Request>
        columns={columns}
        rows={requests}
        rowKey={r => r.id}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        emptyTitle="Sin solicitudes propias"
        emptyDesc="Aún no creaste solicitudes con estos filtros."
        onRowClick={r => navigate(`/requester/${r.id}`)}
        caption="Tus solicitudes. Pulsa una fila para abrir el detalle."
      />
      {!loading && !error && requests.length > 0 && (
        <>
          <p className="muted small" role="status">Mostrando {requests.length} de {filteredTotal} resultados.</p>
          <Pagination page={page} totalPages={totalPages} total={filteredTotal} pageSize={limit} onPage={setPage} onPageSize={n => { setLimit(n); setPage(1); }} />
        </>
      )}
    </Page>
  );
};
