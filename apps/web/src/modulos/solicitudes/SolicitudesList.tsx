import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Can } from '../../componentes/auth/Can';
import { useCompany } from '../../contextos/CompanyContext';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { requestService } from '../../servicios';
import { Page, Button, StatusBadge, PriorityBadge, SearchInput, EmptyState, ErrorState, Skeleton, Select } from '../../componentes/ui';
import type { Request } from '../../tipos';
import type { RequestStatus } from '../../tipos';

const STATUS_OPTIONS: Array<{ value: '' | RequestStatus; label: string }> = [
  { value: '', label: 'Todos los estados' },
  { value: 'BORRADOR', label: 'Borrador' },
  { value: 'PENDIENTE_GERENTE', label: 'Pendiente de Gerente' },
  { value: 'PENDIENTE_ALMACEN', label: 'Pendiente de Almacén' },
  { value: 'ALMACEN_APROBADO', label: 'Almacén aprobado' },
  { value: 'PENDIENTE_CONTABILIDAD', label: 'Pendiente de Contabilidad' },
  { value: 'PENDIENTE_VALIDACION_MAESTRA', label: 'Validación Maestra' },
  { value: 'APROBADO_FINAL', label: 'Aprobación Final' },
  { value: 'PROCESANDO_PROFIT', label: 'Procesando en Profit' },
  { value: 'REGISTRADO_PROFIT', label: 'Registrado en Profit' },
  { value: 'ERROR_PROFIT', label: 'Error en Profit' },
  { value: 'DEVUELTO', label: 'Devuelto' },
  { value: 'RECHAZADO', label: 'Rechazado' },
];

/** 11B — Centro operativo de solicitudes (datos reales, filtros soportados por API). */
export const RequesterList: React.FC = () => {
  const { companyId } = useCompany();
  const { usuarios, departamentos } = useOrganizacion(companyId);
  const navigate = useNavigate();
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<'' | RequestStatus>('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback((q: string, st: '' | RequestStatus, cid?: string) => {
    setLoading(true);
    setError(null);
    requestService.list({ companyId: cid || undefined, search: q || undefined, status: st || undefined }).then(
      r => {
        setRequests(r.data);
        setLoading(false);
      },
      () => {
        setRequests([]);
        setError('No pudimos cargar las solicitudes.');
        setLoading(false);
      },
    );
  }, []);

  // Búsqueda con debounce; el filtrado por estado y texto lo resuelve el backend.
  React.useEffect(() => {
    const t = setTimeout(() => load(search.trim(), status, companyId), 300);
    return () => clearTimeout(t);
  }, [search, status, companyId, load]);

  const nameOf = (id: string) => usuarios.find(u => u.id === id)?.displayName ?? '—';
  const deptOf = (id: string) => departamentos.find(d => d.id === id)?.name ?? '—';

  return (
    <Page
      title="Solicitudes"
      desc="Gestiona y consulta las solicitudes de datos maestros."
      actions={<Can permission="REQUEST.CREATE"><a href="/requester/new"><Button>+ Nueva solicitud</Button></a></Can>}
    >
      <div className="toolbar" role="search">
        <span className="grow"><SearchInput value={search} onChange={setSearch} placeholder="Buscar por descripción o número..." /></span>
        <Select value={status} onChange={e => setStatus(e.target.value as '' | RequestStatus)} aria-label="Filtrar por estado">
          {STATUS_OPTIONS.map(o => <option key={o.label} value={o.value}>{o.label}</option>)}
        </Select>
      </div>

      {loading && (
        <div className="card p16 stack-sm" aria-label="Cargando solicitudes">
          <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} /><Skeleton height={40} />
        </div>
      )}
      {!loading && error && <ErrorState title="No pudimos cargar las solicitudes." onRetry={() => load(search.trim(), status, companyId)} />}
      {!loading && !error && requests.length === 0 && (
        <EmptyState
          title="No hay solicitudes para mostrar"
          desc={search || status ? 'Prueba con otros filtros.' : 'Crea una nueva solicitud para comenzar.'}
        />
      )}
      {!loading && !error && requests.length > 0 && (
        <div className="card table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Descripción</th>
                <th>Solicitante</th>
                <th>Área</th>
                <th>Estado</th>
                <th>Prioridad</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id} className="clickable" onClick={() => navigate(`/requester/${r.id}`)}>
                  <td data-label="N°"><strong>#{r.requestNumber}</strong></td>
                  <td data-label="Descripción" className="ellipsis">{r.requestedDescription}</td>
                  <td data-label="Solicitante">{nameOf(r.requesterId)}</td>
                  <td data-label="Área">{deptOf(r.departmentId)}</td>
                  <td data-label="Estado"><StatusBadge status={r.status} /></td>
                  <td data-label="Prioridad"><PriorityBadge priority={r.priority} /></td>
                  <td data-label="Fecha" className="muted small">{new Date(r.createdAt).toLocaleDateString('es-VE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
};
