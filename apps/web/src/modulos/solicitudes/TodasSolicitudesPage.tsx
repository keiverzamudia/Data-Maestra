import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequestListAll } from '../../servicios/api/api-request-service';
import { useCompany } from '../../contextos/CompanyContext';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import {
  Page, StatusBadge, SearchInput, Select, DataTable, Pagination, EmptyState, type DataColumn,
} from '../../componentes/ui';
import { HelpButton } from '../../componentes/ayuda';
import { etapaActual } from '../../utilidades/presentacion';
import type { Request } from '../../tipos';

type Orden = 'recientes' | 'antiguas' | 'actualizadas';

const PAGE_SIZE = 25;

type Row = Request & {
  requester?: { displayName?: string };
  company?: { name?: string };
};

/**
 * FASE 19 §11-§12 — Todas las solicitudes (gerencial).
 * Universo completo del ámbito autorizado, paginado en backend.
 * Requiere SOLICITUDES.VIEW_ALL (ruta + endpoint protegidos).
 */
export const TodasSolicitudesPage: React.FC = () => {
  const { companyId, companies } = useCompany();
  const { departamentos, usuarios } = useOrganizacion(companyId);
  const navigate = useNavigate();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [empresa, setEmpresa] = React.useState('');
  const [solicitante, setSolicitante] = React.useState('');
  const [orden, setOrden] = React.useState<Orden>('recientes');
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [filteredTotal, setFilteredTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiRequestListAll({
        companyId: empresa || undefined,
        status: status || undefined,
        requesterId: solicitante || undefined,
        search: debounced.trim() || undefined,
        sort: orden,
        page,
        limit: PAGE_SIZE,
      });
      setRows(r.data as Row[]);
      setFilteredTotal(r.filteredTotal ?? r.total);
      setTotalPages(Math.max(Math.ceil((r.filteredTotal ?? r.total) / (r.limit ?? PAGE_SIZE)), 1));
    } catch (err: any) {
      setRows([]);
      setError(err?.message || 'No pudimos cargar las solicitudes.');
    } finally {
      setLoading(false);
    }
  }, [empresa, status, solicitante, debounced, orden, page]);

  React.useEffect(() => { void load(); }, [load]);

  const deptOf = (id: string) => departamentos.find(d => d.id === id)?.name ?? '—';
  const companyOf = (r: Row) => r.company?.name ?? companies.find(c => c.id === r.companyId)?.name ?? '—';

  const columns: DataColumn<Row>[] = [
    { key: 'num', header: 'Nº Solicitud', label: '#', render: r => <strong>#{r.requestNumber}</strong> },
    { key: 'desc', header: 'Descripción', label: 'Descripción', render: r => <span className="ellipsis">{r.requestedDescription}</span> },
    { key: 'sol', header: 'Solicitante', label: 'Solicitante', render: r => <span>{r.requester?.displayName ?? '—'}</span> },
    { key: 'emp', header: 'Empresa', label: 'Empresa', render: r => companyOf(r) },
    { key: 'area', header: 'Área', label: 'Área', render: r => deptOf(r.departmentId) },
    { key: 'est', header: 'Estado actual', label: 'Estado', render: r => <StatusBadge status={r.status} /> },
    { key: 'cre', header: 'Creada', label: 'Creada', render: r => <span className="muted small">{new Date(r.createdAt).toLocaleDateString('es-VE')}</span> },
    { key: 'upd', header: 'Actualizada', label: 'Actualizada', render: r => <span className="muted small">{new Date(r.updatedAt).toLocaleDateString('es-VE')}</span> },
    { key: 'master', header: 'Código Master', label: 'Master', render: r => <span className="mono">{r.masterCode || '—'}</span> },
    { key: 'profit', header: 'Código Profit', label: 'Profit', render: r => <span className="mono">{r.profitCode || '—'}</span> },
    { key: 'acc', header: 'Acción', label: 'Acción', render: r => <span className="muted small" style={{ whiteSpace: 'nowrap' }}>{etapaActual(r.status)}</span> },
  ];

  return (
    <Page
      title="Todas las solicitudes"
      desc="Universo completo de solicitudes del ámbito autorizado."
      actions={<HelpButton helpKey="todas" />}
    >
      <div className="toolbar" role="search">
        <span className="grow">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por número, descripción, master, profit o part number..." />
        </span>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} aria-label="Filtrar por estado">
          <option value="">Todos los estados</option>
          <option value="BORRADOR">Borrador</option>
          <option value="PENDIENTE_GERENTE">Pendiente gerente</option>
          <option value="PENDIENTE_ALMACEN">Pendiente almacén</option>
          <option value="ALMACEN_APROBADO">Almacén aprobado</option>
          <option value="PENDIENTE_CONTABILIDAD">Pendiente contabilidad</option>
          <option value="CONTABILIDAD_APROBADA">Contabilidad aprobada</option>
          <option value="PROCESANDO_PROFIT">Procesando Profit</option>
          <option value="INSERTADO_PROFIT">Insertado en Profit</option>
          <option value="ERROR_PROFIT">Error Profit</option>
          <option value="DEVUELTO">Devuelto</option>
          <option value="RECHAZADO">Rechazado</option>
        </Select>
        <Select value={empresa} onChange={e => { setEmpresa(e.target.value); setPage(1); }} aria-label="Filtrar por empresa">
          <option value="">Todas las empresas</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={solicitante} onChange={e => { setSolicitante(e.target.value); setPage(1); }} aria-label="Filtrar por solicitante">
          <option value="">Todos los solicitantes</option>
          {usuarios.map(u => <option key={u.id} value={u.id}>{u.displayName}</option>)}
        </Select>
        <Select value={orden} onChange={e => { setOrden(e.target.value as Orden); setPage(1); }} aria-label="Ordenar">
          <option value="recientes">Más recientes</option>
          <option value="antiguas">Más antiguas</option>
          <option value="actualizadas">Última actualización</option>
        </Select>
      </div>

      {loading && <EmptyState title="Cargando…" desc="Consultando solicitudes." />}
      {!loading && error && <EmptyState title="No pudimos cargar." desc={error} />}
      {!loading && !error && (
        <>
          <DataTable<Row>
            columns={columns}
            rows={rows}
            rowKey={r => r.id}
            emptyTitle="Sin solicitudes"
            emptyDesc="No hay solicitudes con estos filtros."
            onRowClick={r => navigate(`/requester/${r.id}`)}
            caption="Todas las solicitudes. Pulsa una fila para abrir el detalle."
          />
          {rows.length > 0 && (
            <>
              <p className="muted small" role="status">Mostrando {rows.length} de {filteredTotal} resultados.</p>
              <Pagination page={page} totalPages={totalPages} total={filteredTotal} pageSize={PAGE_SIZE} onPage={setPage} />
            </>
          )}
        </>
      )}
    </Page>
  );
};
