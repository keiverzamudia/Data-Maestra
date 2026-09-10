import * as React from 'react';
import { Can } from '../../componentes/auth/Can';
import { useCompany } from '../../contextos/CompanyContext';
import { finalReviewService } from '../../servicios';
import { useCatalogos } from '../../hooks/useCatalogos';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { Button, SearchInput, StatusBadge, EmptyState, Modal, Textarea, Alert, ConfirmDialog, Skeleton, ErrorState } from '../../componentes/ui';
import { Page } from '../../componentes/ui';
import { WorkflowStepper, WorkflowStatusInfo, RequestDetail, StageTrace } from '../../componentes/workflow';
import type { Request } from '../../tipos';

function findName(list: { id: string; name: string }[], id?: string) {
  return list.find(x => x.id === id)?.name || '—';
}

export const FinalReviewPage: React.FC = () => {
  const { companyId } = useCompany();
  const { grupos, subgrupos, marcas } = useCatalogos();
  const { usuarios } = useOrganizacion(companyId);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<Request | null>(null);
  const [rejectModal, setRejectModal] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  // 12E — mensaje de cierre tras aprobar (sin afirmar registro en Profit).
  const [justApproved, setJustApproved] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLoading(true);
    setListError(null);
    finalReviewService.getPendingReviews(companyId).then(
      r => {
        setRequests(r);
        setLoading(false);
      },
      () => {
        setRequests([]);
        setListError('No pudimos cargar las solicitudes pendientes.');
        setLoading(false);
      },
    );
  }, [companyId]);

  const filtered = search
    ? requests.filter(r =>
        r.requestedDescription.toLowerCase().includes(search.toLowerCase()) ||
        String(r.requestNumber).includes(search)
      )
    : requests;

  const openDetail = (r: Request) => {
    setSelected(r);
    setError(null);
    // Detalle con aprobaciones (trazabilidad real); si falla, se usa la fila.
    finalReviewService.getReviewDetail(r.id).then(
      d => setSelected(d),
      () => {},
    );
  };

  const handleApprove = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      await finalReviewService.approveReview(selected.id);
      setJustApproved(`✓ Aprobación final completada — la solicitud ${selected.requestNumber} cumple con los estándares requeridos para continuar con su registro en Profit. Siguiente etapa: Registrando en Profit.`);
      setSelected(null);
      finalReviewService.getPendingReviews(companyId).then(setRequests);
    } catch (err: any) {
      setError(err?.message || 'Error al aprobar la solicitud.');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      await finalReviewService.rejectReview(selected.id, rejectReason);
      setSelected(null);
      setRejectModal(false);
      setRejectReason('');
      finalReviewService.getPendingReviews(companyId).then(setRequests);
    } catch (err: any) {
      setError(err?.message || 'Error al rechazar la solicitud.');
    } finally {
      setSaving(false);
    }
  };

  if (selected) {
    // 12E — Aprobación Final es cierre: sin checklist (responsabilidad de Contabilidad).
    // Solo lectura + trazabilidad real del historial.
    const accCount = selected.accountingCodes?.length ?? 0;

    return (
      <Page
        title={`Validación Maestra — ${selected.requestNumber}`}
        desc="Solicitud lista para aprobación final"
        actions={<Button variant="secondary" onClick={() => setSelected(null)}>Volver</Button>}
      >
        <WorkflowStepper status={selected.status} />
        <WorkflowStatusInfo status={selected.status} />

        <div className="card p16">
          <h3 className="h1" style={{ fontSize: 14 }}>Cierre de validaciones</h3>
          <p className="muted" style={{ marginTop: 4 }}>
            Las validaciones requeridas de Almacén, Contabilidad y Validación Maestra han sido completadas.
            Esta es la última aprobación humana antes del registro en Profit.
          </p>
          <div style={{ marginTop: 8 }}>
            <StageTrace approvals={selected.approvals} accCount={accCount} validationCurrent />
          </div>
          <div style={{ marginTop: 8 }}>
            <Alert tone={accCount > 0 ? 'success' : 'warning'}>
              {accCount > 0
                ? `Contabilidad ✓ VALIDADA — ${accCount} posición${accCount === 1 ? '' : 'es'} contable${accCount === 1 ? '' : 's'}.`
                : 'Contabilidad — sin información contable registrada en esta solicitud (casos anteriores a la validación contable).'}
            </Alert>
          </div>
        </div>

        <div className="stack">
          <RequestDetail request={selected} showWorkflow={false} />

          <div className="action-bar">
            <Can permission="FINAL_REVIEW.APPROVE">
              <Button variant="danger" onClick={() => setRejectModal(true)} disabled={saving}>Rechazar / Devolver</Button>
              <Button onClick={() => setConfirmApprove(true)} disabled={saving}>{saving ? 'Aprobando...' : '✓ Aprobar y pasar a Profit'}</Button>
            </Can>
          </div>

          <ConfirmDialog
            open={confirmApprove}
            title="Aprobar y pasar a Profit"
            desc="Esta solicitud ha completado las validaciones de Almacén, Contabilidad y Validación Maestra. Al aprobar, quedará validada y lista para continuar con su registro en Profit. El registro en Profit aún no se ha realizado."
            confirmLabel="✓ Aprobar y pasar a Profit"
            busy={saving}
            onCancel={() => setConfirmApprove(false)}
            onConfirm={() => { setConfirmApprove(false); void handleApprove(); }}
          />

          {error && (
            <Alert tone="danger">{error}</Alert>
          )}
        </div>

        <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Rechazar Solicitud">
          <div className="stack-sm">
            <p className="muted">Indique el motivo del rechazo:</p>
            <Textarea
              placeholder="Ejemplo: Información incompleta, clasificación incorrecta..."
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
            />
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setRejectModal(false)} disabled={saving}>Cancelar</Button>
              <Button variant="danger" onClick={handleReject} disabled={saving || !rejectReason.trim()}>{saving ? 'Rechazando...' : 'Rechazar'}</Button>
            </div>
          </div>
        </Modal>
      </Page>
    );
  }

  return (
    <Page
      title="Validación Maestra"
      desc={loading ? 'Última aprobación humana antes del registro en Profit.' : `${filtered.length} solicitud${filtered.length === 1 ? '' : 'es'} lista${filtered.length === 1 ? '' : 's'} para aprobación final.`}
    >
      <div className="toolbar" role="search">
        <span className="grow"><SearchInput value={search} onChange={setSearch} placeholder="Buscar por número o descripción..." /></span>
      </div>

      {justApproved && (
        <div style={{ marginTop: 12 }}>
          <Alert tone="success">{justApproved}</Alert>
        </div>
      )}

      {loading && (
        <div className="card p16 stack-sm" aria-label="Cargando solicitudes">
          <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} />
        </div>
      )}
      {!loading && listError && <ErrorState title="No pudimos cargar las solicitudes pendientes." onRetry={() => {
        setLoading(true);
        setListError(null);
        finalReviewService.getPendingReviews(companyId).then(
          r => {
            setRequests(r);
            setLoading(false);
          },
          () => {
            setRequests([]);
            setListError('No pudimos cargar las solicitudes pendientes.');
            setLoading(false);
          },
        );
      }} />}
      {!loading && !listError && filtered.length === 0 && (
        <EmptyState title="No hay solicitudes pendientes de validación" desc="Todas las solicitudes han sido procesadas" />
      )}
      {!loading && !listError && filtered.length > 0 && (
        <div className="card table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Descripción</th>
                <th>Grupo</th>
                <th>Subgrupo</th>
                <th>Marca</th>
                <th>Código Master</th>
                <th>Solicitante</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td data-label="N°"><strong>#{r.requestNumber}</strong></td>
                  <td data-label="Descripción" className="ellipsis">{r.requestedDescription}</td>
                  <td data-label="Grupo">{findName(grupos, r.groupId)}</td>
                  <td data-label="Subgrupo">{findName(subgrupos, r.subgroupId)}</td>
                  <td data-label="Marca">{findName(marcas, r.brandId)}</td>
                  <td data-label="Código Master">
                    <span className="master-code-display" style={{ fontSize: 12 }}>
                      {r.masterCode || '—'}
                    </span>
                  </td>
                  <td data-label="Solicitante">{usuarios.find(u => u.id === r.requesterId)?.displayName || '—'}</td>
                  <td data-label="Estado"><StatusBadge status={r.status} /></td>
                  <td data-label="Acción">
                    <Button size="sm" onClick={() => openDetail(r)}>Revisar</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
};
