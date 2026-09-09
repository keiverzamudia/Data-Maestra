import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { requestService } from '../../servicios';
import { Page, Button, StatusBadge, Skeleton, ErrorState } from '../../componentes/ui';
import { RequestDetail, WorkflowStepper, WorkflowStatusInfo } from '../../componentes/workflow';
import type { Request } from '../../tipos';

/** 11B — Detalle con jerarquía: cabecera, workflow, contexto y secciones. */
export const RequestDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [request, setRequest] = React.useState<Request | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    requestService.getById(id).then(
      r => {
        if (r) setRequest(r);
        else setError('La solicitud no existe.');
        setLoading(false);
      },
      () => {
        setError('No pudimos cargar la solicitud.');
        setLoading(false);
      },
    );
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Page title="Solicitud">
        <div className="card p16 stack-sm" aria-label="Cargando solicitud">
          <Skeleton height={20} width="30%" /><Skeleton height={36} /><Skeleton height={80} /><Skeleton height={60} />
        </div>
      </Page>
    );
  }

  if (error || !request) {
    return (
      <Page title="Solicitud">
        <ErrorState title={error ?? 'La solicitud no existe.'} onRetry={load} />
      </Page>
    );
  }

  return (
    <Page
      title={`Solicitud #${request.requestNumber}`}
      desc={request.requestedDescription}
      actions={<Button variant="secondary" onClick={() => navigate(-1)}>Volver</Button>}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <StatusBadge status={request.status} />
        <span className="muted small">{new Date(request.createdAt).toLocaleDateString('es-VE')}</span>
      </div>
      <WorkflowStepper status={request.status} />
      <WorkflowStatusInfo status={request.status} />
      <RequestDetail request={request} showWorkflow={false} />
    </Page>
  );
};
