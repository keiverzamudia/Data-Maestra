import * as React from 'react';
import { useCompany } from '../../contextos/CompanyContext';
import { requestService } from '../../servicios';
import { PageHeader, Button, Badge, StatusBadge, PriorityBadge, SearchInput, EmptyState } from '../../componentes/ui';
import type { Request } from '../../tipos';

export const RequesterList: React.FC = () => {
  const { companyId } = useCompany();
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    requestService.list({ companyId: companyId || undefined, search: search || undefined }).then(r => {
      setRequests(r.data);
      setLoading(false);
    });
  }, [search, companyId]);

  return (
    <div className="stack">
      <PageHeader
        title="Solicitante"
        subtitle="Crear y gestionar solicitudes de artículos"
        action={<a href="/requester/new"><Button>Nueva Solicitud</Button></a>}
      />

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por descripción o número..." />

      {loading ? (
        <div className="empty">Cargando...</div>
      ) : requests.length === 0 ? (
        <EmptyState title="No hay solicitudes" desc="Crea una nueva solicitud para comenzar" />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Descripción</th>
                <th>Estado</th>
                <th>Prioridad</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => (
                <tr key={r.id} className="clickable" onClick={() => window.location.href = `/requester/${r.id}`}>
                  <td><strong>{r.requestNumber}</strong></td>
                  <td className="ellipsis">{r.requestedDescription}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td><PriorityBadge priority={r.priority} /></td>
                  <td className="muted small">{new Date(r.createdAt).toLocaleDateString('es-VE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
