import * as React from 'react';
import { Can } from '../../componentes/auth/Can';
import { useCompany } from '../../contextos/CompanyContext';
import { warehouseApprovalService, auditService } from '../../servicios';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { useCatalogos } from '../../hooks/useCatalogos';
import { Button, SearchInput, StatusBadge, PriorityBadge, EmptyState, Alert, ConfirmDialog, Modal, Textarea, Skeleton, ErrorState, DataTable, type DataColumn, Page } from '../../componentes/ui';
import { HelpButton } from '../../componentes/ayuda';
import { RequestDetail, WorkflowStepper, WorkflowStatusInfo } from '../../componentes/workflow';
import type { Request } from '../../tipos';

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

/**
 * 15A — Cola del Encargado de Almacén: revisa lo clasificado por Almacén
 * (ALMACEN_APROBADO) y aprueba hacia Contabilidad. La tabla NUNCA aprueba:
 * [Revisar] abre el detalle y la decisión se confirma dentro del detalle.
 */
export const AprobacionAlmacenPage: React.FC = () => {
  const { companyId } = useCompany();
  const { usuarios, departamentos } = useOrganizacion(companyId);
  const { grupos, subgrupos } = useCatalogos();
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [listError, setListError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Request | null>(null);
  const [clasificadoPor, setClasificadoPor] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  const [returnModal, setReturnModal] = React.useState(false);
  const [rejectModal, setRejectModal] = React.useState(false);
  const [motivo, setMotivo] = React.useState('');

  const loadRequests = React.useCallback(() => {
    setLoading(true);
    setError(null);
    setListError(null);
    warehouseApprovalService.getPendingApprovals(companyId || undefined).then(
      (data) => {
        setRequests(data);
        setLoading(false);
      },
      () => {
        setListError('No pudimos cargar las solicitudes.');
        setLoading(false);
      },
    );
  }, [companyId]);

  React.useEffect(() => { loadRequests(); }, [loadRequests]);

  // Detalle fresco + quién clasificó (auditoría CLASSIFIED, tolerante a fallos).
  React.useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const id = selected.id;
    warehouseApprovalService.getApprovalDetail(id).then(
      (full) => { if (!cancelled && full) setSelected(full); },
      () => {},
    );
    auditService.getEvents({ entityId: id, action: 'CLASSIFIED' }).then(
      (res) => {
        if (cancelled) return;
        const actorId = res.data[0]?.actorId;
        setClasificadoPor(actorId ? (usuarios.find(u => u.id === actorId)?.displayName ?? actorId) : null);
      },
      () => { if (!cancelled) setClasificadoPor(null); },
    );
    return () => { cancelled = true; };
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = search.trim().toLowerCase();
  const filtered = q
    ? requests.filter(r =>
        r.requestedDescription.toLowerCase().includes(q) ||
        String(r.requestNumber).includes(q) ||
        (r.masterCode ?? '').toLowerCase().includes(q)
      )
    : requests;

  const closeDetail = React.useCallback(() => {
    setSelected(null);
    setClasificadoPor(null);
    setMotivo('');
    setReturnModal(false);
    setRejectModal(false);
  }, []);

  const handleApprove = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      await warehouseApprovalService.approveApproval(selected.id);
      closeDetail();
      loadRequests();
    } catch (err: any) {
      setError(err?.message || 'Error al aprobar la solicitud.');
    } finally {
      setSaving(false);
    }
  };

  const handleReturn = async () => {
    if (!selected || saving || !motivo.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await warehouseApprovalService.returnApproval(selected.id, motivo.trim());
      closeDetail();
      loadRequests();
    } catch (err: any) {
      setError(err?.message || 'Error al devolver la solicitud.');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!selected || saving || !motivo.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await warehouseApprovalService.rejectApproval(selected.id, motivo.trim());
      closeDetail();
      loadRequests();
    } catch (err: any) {
      setError(err?.message || 'Error al rechazar la solicitud.');
    } finally {
      setSaving(false);
    }
  };

  const columns: DataColumn<Request>[] = [
    { key: 'num', header: 'N°', label: 'N°', render: r => <strong>#{r.requestNumber}</strong> },
    { key: 'desc', header: 'Descripción', label: 'Descripción', render: r => <span className="ellipsis">{r.requestedDescription}</span> },
    { key: 'req', header: 'Solicitante', label: 'Solicitante', render: r => usuarios.find(u => u.id === r.requesterId)?.displayName || '—' },
    { key: 'area', header: 'Área', label: 'Área', render: r => departamentos.find(d => d.id === r.departmentId)?.name || '—' },
    { key: 'fecha', header: 'Fecha', label: 'Fecha', render: r => <span className="muted small">{new Date(r.createdAt).toLocaleDateString('es-VE')}</span> },
    { key: 'pri', header: 'Prioridad', label: 'Prioridad', render: r => <PriorityBadge priority={r.priority} /> },
    { key: 'master', header: 'Código Master', label: 'Código Master', render: r => <span className="mono">{r.masterCode || '—'}</span> },
    { key: 'est', header: 'Estado', label: 'Estado', render: r => <StatusBadge status={r.status} /> },
    { key: 'acc', header: 'Acción', label: 'Acción', render: r => (
      <span className="row-actions">
        <Button size="sm" variant="secondary" onClick={() => setSelected(r)}>Revisar</Button>
      </span>
    ) },
  ];

  if (selected) {
    const requester = usuarios.find(u => u.id === selected.requesterId)?.displayName || '—';
    const dept = departamentos.find(d => d.id === selected.departmentId)?.name || '—';
    const groupName = grupos.find(g => g.id === selected.groupId)?.name || selected.groupId || '—';
    const subName = subgrupos.find(s => s.id === selected.subgroupId)?.name || selected.subgroupId || '—';
    const approvals = [...(selected.approvals ?? [])].sort(
      (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
    );

    return (
      <Page
        title={`Aprobación Almacén — ${selected.requestNumber}`}
        desc={selected.requestedDescription}
        actions={<span style={{ display: 'flex', gap: 8 }}><HelpButton helpKey="aprobacion-almacen" status={selected.status} /><Button variant="secondary" onClick={closeDetail}>Volver a la bandeja</Button></span>}
      >
        <WorkflowStepper status={selected.status} />
        <WorkflowStatusInfo status={selected.status} />

        <Alert tone="info">
          Esta solicitud fue clasificada por Almacén y está pendiente de tu aprobación.
          Al aprobarla pasará a Contabilidad. Revisa la clasificación antes de decidir.
        </Alert>

        <div className="card p16">
          <div className="review-grid">
            <div><span className="muted small">Solicitante</span><br /><strong>{requester}</strong></div>
            <div><span className="muted small">Área</span><br /><strong>{dept}</strong></div>
            <div><span className="muted small">Prioridad</span><br /><PriorityBadge priority={selected.priority} /></div>
            <div><span className="muted small">Fecha</span><br /><strong>{fmtFecha(selected.createdAt)}</strong></div>
            <div><span className="muted small">Clasificado por</span><br /><strong>{clasificadoPor ?? '—'}</strong></div>
            <div><span className="muted small">Código Master</span><br /><strong className="mono">{selected.masterCode || '—'}</strong></div>
          </div>
        </div>

        <RequestDetail request={selected} showWorkflow={false} />

        <div className="card p16" aria-label="Recorrido de la solicitud">
          <h3 className="subsection-title">Recorrido</h3>
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

        {error && <Alert tone="danger">{error}</Alert>}

        <div className="action-bar">
          <Button variant="secondary" onClick={closeDetail}>Volver</Button>
          <Can permission="WAREHOUSE_MANAGER.APPROVE">
            <Button variant="secondary" onClick={() => { setMotivo(''); setReturnModal(true); }} disabled={saving}>Devolver</Button>
            <Button variant="danger" onClick={() => { setMotivo(''); setRejectModal(true); }} disabled={saving}>Rechazar</Button>
            <Button onClick={() => setConfirmApprove(true)} disabled={saving}>
              {saving ? 'Procesando…' : 'Aprobar solicitud'}
            </Button>
          </Can>
        </div>

        <ConfirmDialog
          open={confirmApprove}
          title="Aprobar clasificación"
          desc={`¿Aprobar la solicitud #${selected.requestNumber} para continuar a Contabilidad? Grupo: ${groupName}. Subgrupo: ${subName}. Código Master: ${selected.masterCode || '—'}.`}
          confirmLabel="Aprobar"
          busy={saving}
          onCancel={() => setConfirmApprove(false)}
          onConfirm={() => { setConfirmApprove(false); void handleApprove(); }}
        />

        <Modal open={returnModal} onClose={() => setReturnModal(false)} title="Devolver solicitud">
          <div className="stack-sm">
            <p className="muted">La solicitud volverá al flujo anterior. Indique el motivo:</p>
            <Textarea
              placeholder="Ejemplo: Grupo incorrecto, falta unidad Profit..."
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={3}
            />
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setReturnModal(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={handleReturn} disabled={saving || !motivo.trim()}>{saving ? 'Devolviendo…' : 'Devolver'}</Button>
            </div>
          </div>
        </Modal>

        <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Rechazar solicitud">
          <div className="stack-sm">
            <p className="muted">El rechazo es definitivo. Indique el motivo:</p>
            <Textarea
              placeholder="Ejemplo: Artículo duplicado, no corresponde..."
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={3}
            />
            <div className="form-actions">
              <Button variant="secondary" onClick={() => setRejectModal(false)} disabled={saving}>Cancelar</Button>
              <Button variant="danger" onClick={handleReject} disabled={saving || !motivo.trim()}>{saving ? 'Rechazando…' : 'Rechazar'}</Button>
            </div>
          </div>
        </Modal>
      </Page>
    );
  }

  return (
    <Page
      title="Aprobación Almacén"
      desc={loading ? 'Solicitudes clasificadas pendientes de aprobación.' : `${filtered.length} solicitud${filtered.length === 1 ? '' : 'es'} por aprobar.`}
      actions={<HelpButton helpKey="aprobacion-almacen" />}
    >
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="toolbar" role="search">
        <span className="grow"><SearchInput value={search} onChange={setSearch} placeholder="Buscar por número, descripción o código master..." /></span>
      </div>

      {loading && (
        <div className="card p16 stack-sm" aria-label="Cargando solicitudes">
          <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} />
        </div>
      )}
      {!loading && listError && <ErrorState title="No pudimos cargar las solicitudes." onRetry={loadRequests} />}
      {!loading && !listError && filtered.length === 0 && (
        <EmptyState title="No hay solicitudes pendientes de aprobación" desc="Todas las clasificaciones han sido revisadas." />
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
