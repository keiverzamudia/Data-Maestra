import * as React from 'react';
import { useSession } from '../../contextos/SessionContext';
import { finalReviewService } from '../../servicios';
import { useCatalogos } from '../../hooks/useCatalogos';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { PageHeader, Button, SearchInput, StatusBadge, EmptyState, Modal, Textarea } from '../../componentes/ui';
import { WorkflowTimeline, RequestDetail } from '../../componentes/workflow';
import type { Request } from '../../tipos';

function findName(list: { id: string; name: string }[], id?: string) {
  return list.find(x => x.id === id)?.name || '—';
}

export const FinalReviewPage: React.FC = () => {
  const { session } = useSession();
  const { grupos, subgrupos, marcas } = useCatalogos();
  const { usuarios } = useOrganizacion(session.company.id);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<Request | null>(null);
  const [rejectModal, setRejectModal] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLoading(true);
    finalReviewService.getPendingReviews(session.company.id).then(r => {
      setRequests(r);
      setLoading(false);
    });
  }, [session.company.id]);

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
      finalReviewService.getPendingReviews(session.company.id).then(setRequests);
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
      finalReviewService.getPendingReviews(session.company.id).then(setRequests);
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
      <div className="stack" style={{ paddingBottom: 56 }}>
        <PageHeader
          title={`Validación Maestra — ${selected.requestNumber}`}
          subtitle={allOk ? 'Todos los requisitos están completos' : `Faltan ${missing} requisitos`}
          action={<Button variant="secondary" onClick={() => setSelected(null)}>Volver</Button>}
        />

        <WorkflowTimeline status={selected.status} />

        <div className="card p16">
          <h3 className="h1" style={{ fontSize: 14 }}>Checklist de Validación Maestra</h3>
          <p className="muted small" style={{ marginTop: 4 }}>
            Validación solo lectura. No edite grupo, subgrupo, descripción, marca, unidad ni código maestro. Si encuentra inconsistencia, devuelva al área responsable.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
            {checklist.map(item => {
              const isWarn = (item as any).warn && !item.ok;
              return (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '6px 8px', borderRadius: 8, background: item.ok ? '#dcfce7' : isWarn ? '#fef9c3' : '#fee2e2', border: `1px solid ${item.ok ? '#86efac' : isWarn ? '#fde047' : '#fca5a5'}` }}>
                  <span style={{ fontWeight: 800, color: item.ok ? '#166534' : isWarn ? '#854d0e' : '#991b1b' }}>{item.ok ? '✓' : isWarn ? '⚠' : '✕'}</span>
                  <span style={{ fontWeight: 600, color: item.ok ? '#166534' : isWarn ? '#854d0e' : '#991b1b' }}>{item.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: item.ok ? '#166534' : isWarn ? '#854d0e' : '#991b1b' }}>{item.ok ? 'COMPLETO' : isWarn ? 'REVISAR' : 'FALTANTE'}</span>
                </div>
              );
            })}
          </div>
          <div className="alert" style={{ marginTop: 12, background: allOk ? '#dcfce7' : '#fee2e2', borderColor: allOk ? '#86efac' : '#fca5a5', color: allOk ? '#166534' : '#991b1b' }}>
            {allOk ? '✓ Expediente completo — puede aprobar definitivamente.' : `✕ Faltan ${missing} requisitos obligatorios. Complete por el área responsable antes de aprobar.`}
          </div>
        </div>

        <div className="stack">
          <RequestDetail request={selected} showWorkflow={false} />

          <div className="form-actions" style={{ gap: 12 }}>
            <Button variant="danger" onClick={() => setRejectModal(true)} disabled={saving}>Rechazar / Devolver</Button>
            <Button onClick={handleApprove} disabled={saving || !allOk} title={!allOk ? `Faltan ${missing} requisitos` : undefined}>{saving ? 'Aprobando...' : 'Aprobar Definitivamente'}</Button>
          </div>

          {error && (
            <div className="alert" style={{ marginTop: 8, background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>
              {error}
            </div>
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
      </div>
    );
  }

  return (
    <div className="stack">
      <PageHeader title="Aprobación Final" subtitle="Solicitudes pendientes de aprobación definitiva" />

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por número o descripción..." />

      {loading ? (
        <div className="empty">Cargando...</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No hay solicitudes pendientes de aprobación final" desc="Todas las solicitudes han sido procesadas" />
      ) : (
        <div className="card">
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
                  <td><strong>{r.requestNumber}</strong></td>
                  <td className="ellipsis">{r.requestedDescription}</td>
                  <td>{findName(grupos, r.groupId)}</td>
                  <td>{findName(subgrupos, r.subgroupId)}</td>
                  <td>{findName(marcas, r.brandId)}</td>
                  <td>
                    <span className="master-code-display" style={{ fontSize: 12 }}>
                      {r.masterCode || '—'}
                    </span>
                  </td>
                  <td>{usuarios.find(u => u.id === r.requesterId)?.displayName || '—'}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>
                    <Button size="sm" onClick={() => setSelected(r)}>Revisar</Button>
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
