import * as React from 'react';
import { Can } from '../../componentes/auth/Can';
import { useCompany } from '../../contextos/CompanyContext';
import { requestService } from '../../servicios';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { Button, SearchInput, StatusBadge, PriorityBadge, EmptyState, Alert, ConfirmDialog, Skeleton, ErrorState, DataTable, type DataColumn } from '../../componentes/ui';
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

  const columns: DataColumn<Request>[] = [
    { key: 'num', header: 'N°', label: 'N°', render: r => <strong>#{r.requestNumber}</strong> },
    { key: 'desc', header: 'Descripción', label: 'Descripción', render: r => <span className="ellipsis">{r.requestedDescription}</span> },
    { key: 'req', header: 'Solicitante', label: 'Solicitante', render: r => usuarios.find(u => u.id === r.requesterId)?.displayName || '—' },
    { key: 'area', header: 'Área', label: 'Área', render: r => departamentos.find(d => d.id === r.departmentId)?.name || '—' },
    { key: 'fecha', header: 'Fecha', label: 'Fecha', render: r => <span className="muted small">{new Date(r.createdAt).toLocaleDateString('es-VE')}</span> },
    { key: 'pri', header: 'Prioridad', label: 'Prioridad', render: r => <PriorityBadge priority={r.priority} /> },
    { key: 'est', header: 'Estado', label: 'Estado', render: r => <StatusBadge status={r.status} /> },
    { key: 'acc', header: 'Acción', label: 'Acción', render: r => (
      <span className="row-actions">
        <Button size="sm" variant="secondary" onClick={() => setSelected(r)}>Ver</Button>
        <Can permission="MANAGER.APPROVE">
          <Button size="sm" onClick={() => handleApprove(r.id)} disabled={approving}>
            {approving ? 'Aprobando...' : 'Aprobar'}
          </Button>
        </Can>
      </span>
    ) },
  ];

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
        <DataTable<Request>
          columns={columns}
          rows={filtered}
          rowKey={r => r.id}
          caption={`${filtered.length} por aprobar.`}
        />
      )}
    </Page>
  );
};
