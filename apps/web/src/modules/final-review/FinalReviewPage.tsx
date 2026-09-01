import * as React from 'react';
import { useSession } from '../../contexts/SessionContext';
import { finalReviewService } from '../../services';
import { groups, subgroups, categories, brands } from '../../mock/catalog';
import { users, departments } from '../../mock/companies';
import { PageHeader, Button, SearchInput, StatusBadge, EmptyState, Modal, Textarea } from '../../components/ui';
import { WorkflowTimeline, RequestDetail } from '../../components/workflow';
import type { Request } from '../../types';

function findName(list: { id: string; name: string }[], id?: string) {
  return list.find(x => x.id === id)?.name || '—';
}

export const FinalReviewPage: React.FC = () => {
  const { session } = useSession();
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
    return (
      <div className="stack">
        <PageHeader
          title={`Aprobación Final — ${selected.requestNumber}`}
          action={<Button variant="secondary" onClick={() => setSelected(null)}>Volver</Button>}
        />

        <WorkflowTimeline status={selected.status} />

        <div className="grid2">
          <div className="stack">
            <RequestDetail request={selected} showWorkflow={false} />

            <div className="form-actions">
              <Button variant="danger" onClick={() => setRejectModal(true)} disabled={saving}>Rechazar</Button>
              <Button onClick={handleApprove} disabled={saving}>{saving ? 'Aprobando...' : 'Aprobar Definitivamente'}</Button>
            </div>

            {error && (
              <div className="alert" style={{ marginTop: 8, background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>
                {error}
              </div>
            )}
          </div>

          <div className="side-panel">
            <div className="card p16">
              <span className="muted small">Código Master</span>
              <div className="master-code-display" style={{ marginTop: 4 }}>
                {selected.masterCode || '—'}
              </div>
            </div>

            {selected.accountingCodes && selected.accountingCodes.length > 0 && (
              <div className="card p16" style={{ marginTop: 12 }}>
                <span className="muted small">Códigos Contables</span>
                <div style={{ marginTop: 8 }}>
                  {selected.accountingCodes.map((ac, i) => (
                    <div key={i} style={{ marginBottom: 4, fontSize: 13 }}>
                      <strong>{ac.code}</strong> — {ac.description}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
                  <td>{findName(groups, r.groupId)}</td>
                  <td>{findName(subgroups, r.subgroupId)}</td>
                  <td>{findName(brands, r.brandId)}</td>
                  <td>
                    <span className="master-code-display" style={{ fontSize: 12 }}>
                      {r.masterCode || '—'}
                    </span>
                  </td>
                  <td>{users.find(u => u.id === r.requesterId)?.displayName || '—'}</td>
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
