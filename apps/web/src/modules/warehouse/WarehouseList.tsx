import * as React from 'react';
import { useSession } from '../../contexts/SessionContext';
import { warehouseService } from '../../services';
import { PageHeader, Button, SearchInput, StatusBadge, PriorityBadge, EmptyState } from '../../components/ui';
import type { Request } from '../../types';
import { users, departments } from '../../mock/companies';

export const WarehouseList: React.FC = () => {
  const { session } = useSession();
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    warehouseService.getPendingRequests(session.company.id).then(r => {
      setRequests(r);
      setLoading(false);
    });
  }, [session.company.id]);

  const filtered = search
    ? requests.filter(r => r.requestedDescription.toLowerCase().includes(search.toLowerCase()) || String(r.requestNumber).includes(search))
    : requests;

  return (
    <div className="stack">
      <PageHeader title="Clasificación" subtitle="Bandeja de solicitudes pendientes de clasificación" />

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por número, descripción, código..." />

      {loading ? (
        <div className="empty">Cargando...</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No hay solicitudes pendientes" desc="Todas las solicitudes han sido procesadas" />
      ) : (
        <div className="card">
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
                const requester = users.find(u => u.id === r.requesterId);
                const dept = departments.find(d => d.id === r.departmentId);
                return (
                  <tr key={r.id}>
                    <td><strong>REQ-{r.requestNumber}</strong></td>
                    <td className="ellipsis">{r.requestedDescription}</td>
                    <td>{requester?.displayName || '—'}</td>
                    <td>{dept?.name || '—'}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td><PriorityBadge priority={r.priority} /></td>
                    <td>{r.referencePhotoUri ? '📷' : '—'}</td>
                    <td>
                      <a href={`/warehouse/${r.id}`}>
                        <Button size="sm">Calificar</Button>
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
