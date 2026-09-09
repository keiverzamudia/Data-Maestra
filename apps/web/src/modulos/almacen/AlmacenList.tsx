import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Can } from '../../componentes/auth/Can';
import { useCompany } from '../../contextos/CompanyContext';
import { warehouseService } from '../../servicios';
import { Page, Button, SearchInput, StatusBadge, PriorityBadge, EmptyState, ErrorState, Skeleton } from '../../componentes/ui';
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

  return (
    <Page
      title="Almacén"
      desc={loading ? 'Clasifica y completa la información necesaria para continuar el proceso.' : `${filtered.length} solicitud${filtered.length === 1 ? '' : 'es'} por clasificar.`}
    >
      <div className="toolbar" role="search">
        <span className="grow"><SearchInput value={search} onChange={setSearch} placeholder="Buscar por número, descripción, código..." /></span>
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
                <th>Foto</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const requester = usuarios.find(u => u.id === r.requesterId);
                const dept = departamentos.find(d => d.id === r.departmentId);
                return (
                  <tr key={r.id}>
                    <td data-label="N°"><strong>#{r.requestNumber}</strong></td>
                    <td data-label="Descripción" className="ellipsis">{r.requestedDescription}</td>
                    <td data-label="Solicitante">{requester?.displayName || '—'}</td>
                    <td data-label="Área">{dept?.name || '—'}</td>
                    <td data-label="Estado"><StatusBadge status={r.status} /></td>
                    <td data-label="Prioridad"><PriorityBadge priority={r.priority} /></td>
                    <td data-label="Foto">{r.referencePhotoUri ? '📷' : '—'}</td>
                    <td data-label="Acción">
                      <Can permission="WAREHOUSE.CLASSIFY">
                        <Button size="sm" onClick={() => navigate(`/warehouse/${r.id}`)}>Clasificar</Button>
                      </Can>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
};
