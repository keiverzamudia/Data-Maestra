import * as React from 'react';
import { useSession } from '../../contexts/SessionContext';
import { requestService } from '../../services';
import { PageHeader, Button, SearchInput, StatusBadge, PriorityBadge, EmptyState } from '../../components/ui';
import { RequestDetail } from '../../components/workflow';
import type { Request } from '../../types';

export const ApprovalsPage: React.FC = () => {
  const { session } = useSession();
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Request | null>(null);
  const [approving, setApproving] = React.useState(false);

  const loadRequests = React.useCallback(() => {
    setLoading(true);
    setError(null);
    requestService.list({ companyId: session.company.id, status: 'PENDING_MANAGER' })
      .then(({ data }) => {
        setRequests(data);
        setLoading(false);
      })
      .catch(() => {
        setError('No fue posible cargar las solicitudes.');
        setLoading(false);
      });
  }, [session.company.id]);

  React.useEffect(() => { loadRequests(); }, [loadRequests]);

  const filtered = search
    ? requests.filter(r =>
        r.requestedDescription.toLowerCase().includes(search.toLowerCase()) ||
        String(r.requestNumber).includes(search)
      )
    : requests;

  const handleApprove = async (id: string) => {
    if (approving) return;
    setApproving(true);
    setError(null);
    try {
      await requestService.approve(id);
      setSelected(null);
      loadRequests();
    } catch (err: any) {
      console.error('APPROVE ERROR:', err);
      const msg = err?.message || err?.status || JSON.stringify(err);
      setError(`Error al aprobar: ${msg}`);
    } finally {
      setApproving(false);
    }
  };

  if (selected) {
    return (
      <div className="stack">
        <div className="flex-between">
          <h2 className="h1">Solicitud REQ-{selected.requestNumber}</h2>
          <Button variant="secondary" onClick={() => setSelected(null)}>Volver a la bandeja</Button>
        </div>

        <RequestDetail request={selected} showWorkflow={false} />

        {error && (
          <div className="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {error}
            <Button size="sm" onClick={() => setError(null)}>Cerrar</Button>
          </div>
        )}

        <div className="form-actions">
          <Button variant="secondary" onClick={() => setSelected(null)}>Volver</Button>
          <Button onClick={() => handleApprove(selected.id)} disabled={approving}>
            {approving ? 'Aprobando...' : 'Aprobar solicitud'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader title="Aprobaciones" subtitle="Solicitudes pendientes de aprobación gerencial" />

      {error && (
        <div className="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error}
          <Button size="sm" onClick={loadRequests}>Reintentar</Button>
        </div>
      )}

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por número o descripción..." />

      {loading ? (
        <div className="empty">Cargando...</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No hay solicitudes pendientes de aprobación" />
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Descripción</th>
                <th>Solicitante</th>
                <th>Área</th>
                <th>Fecha</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td><strong>REQ-{r.requestNumber}</strong></td>
                  <td className="ellipsis">{r.requestedDescription}</td>
                  <td>{r.requesterId ? `Usuario ${r.requesterId}` : '—'}</td>
                  <td>{r.departmentId ? `Depto ${r.departmentId}` : '—'}</td>
                  <td className="muted small">{new Date(r.createdAt).toLocaleDateString('es-VE')}</td>
                  <td><PriorityBadge priority={r.priority} /></td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button size="sm" variant="secondary" onClick={() => setSelected(r)}>Ver</Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(r.id)}
                        disabled={approving}
                      >
                        {approving ? 'Aprobando...' : 'Aprobar'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
