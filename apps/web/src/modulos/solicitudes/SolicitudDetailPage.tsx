import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { requestService } from '../../servicios';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { Page, Button, StatusBadge, Skeleton, ErrorState, Alert } from '../../componentes/ui';
import { RequestDetail, WorkflowStepper } from '../../componentes/workflow';
import type { Request, ApprovalRef } from '../../tipos';

const AREA_ACTUAL: Record<string, string> = {
  BORRADOR: 'Borrador',
  PENDIENTE_GERENTE: 'Gerente del departamento',
  PENDIENTE_ALMACEN: 'Cola de Almacén',
  ALMACEN_APROBADO: 'Cola de Almacén',
  PENDIENTE_CONTABILIDAD: 'Cola de Contabilidad',
  PENDIENTE_VALIDACION_MAESTRA: 'Cola de Validación Maestra',
  APROBADO_FINAL: 'Completada',
  PROCESANDO_PROFIT: 'Registrando en Profit',
  REGISTRADO_PROFIT: 'Completada',
  ERROR_PROFIT: 'Error técnico',
  DEVUELTO: 'Devuelta',
  RECHAZADO: 'Rechazada',
};

const ACCION_LABEL: Record<string, string> = {
  APPROVE: 'Aprobó',
  RETURN: 'Devolvió',
  REJECT: 'Rechazó',
  SUBMIT: 'Envió',
};

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-VE')} — ${d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;
}

/** 13A — Detalle como vista de seguimiento: recorrido, mi participación y responsable. */
export const RequestDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useSession();
  const { companies } = useCompany();
  const { usuarios, departamentos } = useOrganizacion();
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
        else setError('La solicitud no existe o no tienes acceso a ella.');
        setLoading(false);
      },
      (err: any) => {
        setError(err?.status === 404
          ? 'La solicitud no existe o no tienes acceso a ella.'
          : 'No pudimos cargar la solicitud.');
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

  const approvals: ApprovalRef[] = [...(request.approvals ?? [])].sort(
    (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
  );
  const mine = approvals.filter(a => a.actorId === user?.id);
  const myLast = mine[mine.length - 1];
  const isMine = request.requesterId === user?.id;
  const transferred = !!myLast && myLast.toStatus !== request.status;
  const deptName = departamentos.find(d => d.id === request.departmentId)?.name ?? '—';
  const companyName = companies.find(c => c.id === request.companyId)?.name ?? '—';
  const requesterName = usuarios.find(u => u.id === request.requesterId)?.displayName ?? '—';

  return (
    <Page
      title={`Solicitud #${request.requestNumber}`}
      desc={request.requestedDescription}
      actions={<Button variant="secondary" onClick={() => navigate(-1)}>Volver</Button>}
    >
      <div className="card p16">
        <div className="review-grid">
          <div><span className="muted small">Descripción</span><br /><strong>{request.requestedDescription}</strong></div>
          <div><span className="muted small">Estado actual</span><br /><StatusBadge status={request.status} /></div>
          <div><span className="muted small">Empresa</span><br /><strong>{companyName}</strong></div>
          <div><span className="muted small">Departamento</span><br /><strong>{deptName}</strong></div>
          <div><span className="muted small">Solicitante</span><br /><strong>{requesterName}</strong></div>
          <div><span className="muted small">Actualmente en manos de</span><br /><strong>{AREA_ACTUAL[request.status] ?? request.status}</strong></div>
        </div>
      </div>

      <WorkflowStepper status={request.status} />

      {(myLast || isMine) && (
        <div className="card p16" aria-label="Mi participación">
          <h3 className="h1" style={{ fontSize: 15 }}>Mi participación</h3>
          {myLast ? (
            <div style={{ marginTop: 8 }}>
              <p><strong>✓ {ACCION_LABEL[myLast.action] ?? myLast.action} por mí</strong></p>
              <p className="muted small">{fmtFecha(myLast.createdAt)}</p>
              {myLast.comment && <p className="muted small">Motivo: “{myLast.comment}”</p>}
              <p className="muted small">Solicitud enviada a: <strong>{AREA_ACTUAL[myLast.toStatus] ?? myLast.toStatus}</strong></p>
              <p className="muted small">Estado actual: <strong>{AREA_ACTUAL[request.status] ?? request.status}</strong></p>
            </div>
          ) : (
            <p className="muted small" style={{ marginTop: 8 }}>Creaste esta solicitud y puedes seguir su recorrido.</p>
          )}
          {transferred && (
            <div style={{ marginTop: 8 }}>
              <Alert tone="info">[ Solo lectura ] Tu etapa terminó. Responsabilidad transferida a: {AREA_ACTUAL[myLast!.toStatus] ?? myLast!.toStatus}. Actualmente: {AREA_ACTUAL[request.status] ?? request.status}.</Alert>
            </div>
          )}
        </div>
      )}

      <div className="card p16" aria-label="Recorrido completo">
        <h3 className="h1" style={{ fontSize: 15 }}>Recorrido</h3>
        <div className="stack-sm" style={{ marginTop: 8 }}>
          {approvals.length === 0 && <p className="muted small">Aún sin acciones registradas.</p>}
          {approvals.map(a => (
            <div key={a.id} className="trace-row">
              <span aria-hidden="true">{a.action === 'REJECT' ? '✕' : a.action === 'RETURN' ? '↩' : '✓'}</span>
              <div>
                <div><strong>{a.actor?.displayName ?? '—'}</strong> — {ACCION_LABEL[a.action] ?? a.action}</div>
                <div className="muted small">{fmtFecha(a.createdAt)}</div>
                <div className="muted small">{a.fromStatus} → {a.toStatus}</div>
                {a.comment && <div className="muted small">Motivo: “{a.comment}”</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <RequestDetail request={request} showWorkflow={false} />
    </Page>
  );
};
