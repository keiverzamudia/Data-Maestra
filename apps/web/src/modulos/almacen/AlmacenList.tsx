import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Can } from '../../componentes/auth/Can';
import { useCompany } from '../../contextos/CompanyContext';
import { warehouseService } from '../../servicios';
import { Page, Button, SearchInput, StatusBadge, PriorityBadge, EmptyState, ErrorState, Skeleton, DataTable, Pagination, type DataColumn } from '../../componentes/ui';
import type { Request } from '../../tipos';
import { useOrganizacion } from '../../hooks/useOrganizacion';

/** 11C — Bandeja operativa de Almacén: qué clasificar, con qué prioridad. */
export const WarehouseList: React.FC = () => {
  const { companyId } = useCompany();
  const { usuarios, departamentos } = useOrganizacion(companyId);
  const navigate = useNavigate();
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  // Paginación en cliente: el backend entrega la cola completa (sin page/limit).
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    warehouseService.getPendingRequests(companyId).then(
      r => {
        setRequests(r);
        setLoading(false);
      },
      () => {
        setRequests([]);
        setError('No pudimos cargar las solicitudes pendientes.');
        setLoading(false);
      },
    );
  }, [companyId]);

  React.useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const filtered = q
    ? requests.filter(r => r.requestedDescription.toLowerCase().includes(q) || String(r.requestNumber).includes(q))
    : requests;
  const totalPages = Math.max(Math.ceil(filtered.length / pageSize), 1);
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const onSearch = (v: string) => { setSearch(v); setPage(1); };

  const columns: DataColumn<Request>[] = [
    { key: 'num', header: 'N°', label: 'N°', render: r => <strong>#{r.requestNumber}</strong> },
    { key: 'desc', header: 'Descripción', label: 'Descripción', render: r => <span className="ellipsis">{r.requestedDescription}</span> },
    { key: 'req', header: 'Solicitante', label: 'Solicitante', render: r => usuarios.find(u => u.id === r.requesterId)?.displayName || '—' },
    { key: 'area', header: 'Área', label: 'Área', render: r => departamentos.find(d => d.id === r.departmentId)?.name || '—' },
    { key: 'est', header: 'Estado', label: 'Estado', render: r => <StatusBadge status={r.status} /> },
    { key: 'pri', header: 'Prioridad', label: 'Prioridad', render: r => <PriorityBadge priority={r.priority} /> },
    { key: 'foto', header: 'Foto', label: 'Foto', render: r => (r.referencePhotoUri ? 'Sí' : '—') },
    { key: 'acc', header: 'Acción', label: 'Acción', render: r => (
      <Can permission="WAREHOUSE.CLASSIFY">
        <Button size="sm" onClick={() => navigate(`/warehouse/${r.id}`)}>Clasificar</Button>
      </Can>
    ) },
  ];

  return (
    <Page
      title="Almacén"
      desc={loading ? 'Clasifica y completa la información necesaria para continuar el proceso.' : `${filtered.length} solicitud${filtered.length === 1 ? '' : 'es'} por clasificar.`}
    >
      <div className="toolbar" role="search">
        <span className="grow"><SearchInput value={search} onChange={onSearch} placeholder="Buscar por número, descripción, código..." /></span>
      </div>

      {loading && (
        <div className="card p16 stack-sm" aria-label="Cargando solicitudes">
          <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} />
        </div>
      )}
      {!loading && error && <ErrorState title="No pudimos cargar las solicitudes pendientes." onRetry={load} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState title="No hay solicitudes pendientes" desc="Todas las solicitudes han sido procesadas" />
      )}
      {!loading && !error && filtered.length > 0 && (
        <>
          <DataTable<Request>
            columns={columns}
            rows={visible}
            rowKey={r => r.id}
            caption={`${filtered.length} por clasificar.`}
          />
          <Pagination page={safePage} totalPages={totalPages} total={filtered.length} pageSize={pageSize} onPage={setPage} onPageSize={n => { setPageSize(n); setPage(1); }} />
        </>
      )}
    </Page>
  );
};
