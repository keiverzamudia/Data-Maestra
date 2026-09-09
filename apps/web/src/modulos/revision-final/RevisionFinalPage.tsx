import * as React from 'react';
import { Can } from '../../componentes/auth/Can';
import { useCompany } from '../../contextos/CompanyContext';
import { finalReviewService } from '../../servicios';
import { useCatalogos } from '../../hooks/useCatalogos';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { Button, SearchInput, StatusBadge, EmptyState, Modal, Textarea, Alert, ConfirmDialog, Skeleton, ErrorState } from '../../componentes/ui';
import { Page } from '../../componentes/ui';
import { WorkflowStepper, WorkflowStatusInfo, RequestDetail } from '../../componentes/workflow';
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

  const handleApprove = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      await finalReviewService.approveReview(selected.id);
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
    const checklist = [
      { label: 'Solicitante', ok: !!selected.requesterId },
      { label: 'Departamento', ok: !!selected.departmentId },
      { label: 'Empresa', ok: !!selected.companyId },
      { label: 'Descripción (≥10)', ok: (selected.requestedDescription?.length ?? 0) >= 10 },
      { label: 'Propósito', ok: !!selected.purpose?.trim() },
      { label: 'Grupo', ok: !!selected.groupId },
      { label: 'Subgrupo', ok: !!selected.subgroupId },
      { label: 'Unidad', ok: !!selected.unitId },
      { label: 'Código Maestro', ok: !!selected.masterCode && /^[A-Z0-9]+-[0-9]{5}$/.test(selected.masterCode) },
      { label: 'Código Contable (≥1)', ok: (selected.accountingCodes?.length ?? 0) >= 1 },
      { label: 'Imagen referencial', ok: !!selected.referencePhotoUri, warn: true },
    ];
    const required = checklist.filter(c => !c.warn);
    const missing = required.filter(c => !c.ok).length;
    const allOk = missing === 0;

    return (
      <Page
        title={`Validación Maestra — ${selected.requestNumber}`}
        desc={allOk ? `${required.length} de ${required.length} requisitos completos` : `Faltan ${missing} requisitos`}
        actions={<Button variant="secondary" onClick={() => setSelected(null)}>Volver</Button>}
      >
        <WorkflowStepper status={selected.status} />
        <WorkflowStatusInfo status={selected.status} />

        <div className="card p16">
          <h3 className="h1" style={{ fontSize: 14 }}>Checklist de Validación Maestra</h3>
          <Alert tone="info">
            Validación solo lectura. No edite grupo, subgrupo, descripción, marca, unidad ni código maestro. Si encuentra inconsistencia, devuelva al área responsable.
          </Alert>
          <div className="checklist" style={{ marginTop: 8 }}>
            {checklist.map(item => {
              const isWarn = (item as any).warn && !item.ok;
              const cls = item.ok ? 'check-ok' : isWarn ? 'check-warn' : 'check-missing';
              return (
                <div key={item.label} className={`check ${cls}`}>
                  <span className="check-mark" aria-hidden="true">{item.ok ? '✓' : isWarn ? '⚠' : '✕'}</span>
                  <span className="check-label">{item.label}</span>
                  <span className="check-state">{item.ok ? 'COMPLETO' : isWarn ? 'REVISAR' : 'FALTANTE'}</span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 8 }}>
            <Alert tone={allOk ? 'success' : 'danger'}>
              {allOk ? '✓ Expediente completo — puede aprobar definitivamente.' : `✕ Faltan ${missing} requisitos obligatorios. Complete por el área responsable antes de aprobar.`}
            </Alert>
          </div>
        </div>

        <div className="stack">
          <RequestDetail request={selected} showWorkflow={false} />

          <div className="action-bar">
            <Can permission="FINAL_REVIEW.APPROVE">
              <Button variant="danger" onClick={() => setRejectModal(true)} disabled={saving}>Rechazar / Devolver</Button>
              <Button onClick={() => setConfirmApprove(true)} disabled={saving || !allOk} title={!allOk ? `Faltan ${missing} requisitos` : undefined}>{saving ? 'Aprobando...' : 'Aprobar Definitivamente'}</Button>
            </Can>
          </div>

          <ConfirmDialog
            open={confirmApprove}
            title="Aprobar definitivamente"
            desc="¿Aprobar definitivamente esta solicitud? Después de esta aprobación, pasará al procesamiento técnico."
            confirmLabel="Aprobar definitivamente"
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
      desc={loading ? 'Verifica que la solicitud esté completa antes de pasar a la aprobación final.' : `${filtered.length} solicitud${filtered.length === 1 ? '' : 'es'} por validar.`}
    >
      <div className="toolbar" role="search">
        <span className="grow"><SearchInput value={search} onChange={setSearch} placeholder="Buscar por número o descripción..." /></span>
      </div>

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
                    <Button size="sm" onClick={() => setSelected(r)}>Revisar</Button>
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
