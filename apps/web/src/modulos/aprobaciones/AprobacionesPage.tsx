import * as React from 'react';
import { Can } from '../../componentes/auth/Can';
import { useCompany } from '../../contextos/CompanyContext';
import { requestService } from '../../servicios';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { Button, SearchInput, StatusBadge, PriorityBadge, EmptyState, Alert, ConfirmDialog, Skeleton, ErrorState } from '../../componentes/ui';
import { Page } from '../../componentes/ui';
import { RequestDetail, WorkflowStepper, WorkflowStatusInfo } from '../../componentes/workflow';
import type { Request } from '../../tipos';

export const ApprovalsPage: React.FC = () => {
  const { companyId } = useCompany();
  const { usuarios, departamentos } = useOrganizacion(companyId);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Request | null>(null);
  const [approving, setApproving] = React.useState(false);
  const [confirmApproveId, setConfirmApproveId] = React.useState<string | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);

  const loadRequests = React.useCallback(() => {
    setLoading(true);
    setError(null);
    setListError(null);
    requestService.list({ companyId: companyId || undefined, status: 'PENDIENTE_GERENTE' })
      .then(({ data }) => {
        setRequests(data);
        setLoading(false);
      })
      .catch(() => {
        setListError('No pudimos cargar las solicitudes.');
        setLoading(false);
      });
  }, [companyId]);

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
      <Page
        title={`Aprobación Gerencial — ${selected.requestNumber}`}
        desc={selected.requestedDescription}
        actions={<Button variant="secondary" onClick={() => setSelected(null)}>Volver a la bandeja</Button>}
      >
        <WorkflowStepper status={selected.status} />
        <WorkflowStatusInfo status={selected.status} />

        <RequestDetail request={selected} showWorkflow={false} />

        {error && (
          <Alert tone="danger">{error}</Alert>
        )}

        <div className="action-bar">
          <Button variant="secondary" onClick={() => setSelected(null)}>Volver</Button>
          <Can permission="MANAGER.APPROVE">
            <Button onClick={() => setConfirmApproveId(selected.id)} disabled={approving}>
              {approving ? 'Aprobando...' : 'Aprobar solicitud'}
            </Button>
          </Can>
        </div>

        <ConfirmDialog
          open={confirmApproveId !== null}
          title="Aprobar solicitud"
          desc="¿Aprobar esta solicitud? Pasará a Almacén para su clasificación."
          confirmLabel="Aprobar"
          busy={approving}
          onCancel={() => setConfirmApproveId(null)}
          onConfirm={() => {
            const id = confirmApproveId;
            setConfirmApproveId(null);
            if (id) void handleApprove(id);
          }}
        />
      </Page>
    );
  }

  return (
    <Page
      title="Aprobaciones"
      desc={loading ? 'Solicitudes pendientes de aprobación gerencial.' : `${filtered.length} solicitud${filtered.length === 1 ? '' : 'es'} por aprobar.`}
    >
      {error && (
        <Alert tone="danger">{error}</Alert>
      )}

      <div className="toolbar" role="search">
        <span className="grow"><SearchInput value={search} onChange={setSearch} placeholder="Buscar por número o descripción..." /></span>
      </div>

      {loading && (
        <div className="card p16 stack-sm" aria-label="Cargando solicitudes">
          <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} />
        </div>
      )}
      {!loading && listError && <ErrorState title="No pudimos cargar las solicitudes." onRetry={loadRequests} />}
      {!loading && !listError && filtered.length === 0 && (
        <EmptyState title="No hay solicitudes pendientes de aprobación" />
      )}
      {!loading && !listError && filtered.length > 0 && (
        <div className="card table-responsive">
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
              {filtered.map(r => {
                const requester = usuarios.find(u => u.id === r.requesterId);
                const dept = departamentos.find(d => d.id === r.departmentId);
                return (
                  <tr key={r.id}>
                    <td data-label="N°"><strong>#{r.requestNumber}</strong></td>
                    <td data-label="Descripción" className="ellipsis">{r.requestedDescription}</td>
                    <td data-label="Solicitante">{requester?.displayName || '—'}</td>
                    <td data-label="Área">{dept?.name || '—'}</td>
                    <td data-label="Fecha" className="muted small">{new Date(r.createdAt).toLocaleDateString('es-VE')}</td>
                    <td data-label="Prioridad"><PriorityBadge priority={r.priority} /></td>
                    <td data-label="Estado"><StatusBadge status={r.status} /></td>
                    <td data-label="Acción">
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button size="sm" variant="secondary" onClick={() => setSelected(r)}>Ver</Button>
                        <Can permission="MANAGER.APPROVE">
                          <Button
                            size="sm"
                            onClick={() => handleApprove(r.id)}
                            disabled={approving}
                          >
                            {approving ? 'Aprobando...' : 'Aprobar'}
                          </Button>
                        </Can>
                      </div>
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
