import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../contextos/CompanyContext';
import { accountingService } from '../../servicios';
import { useCatalogos } from '../../hooks/useCatalogos';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { PageHeader, Button, SearchInput, StatusBadge, EmptyState, Modal, Textarea, ImageLightbox } from '../../componentes/ui';
import { WorkflowTimeline } from '../../componentes/workflow';
import { InformacionContable, type ContabilidadEntry } from '../../componentes/contabilidad';
import type { Request } from '../../tipos';

function findName(list: { id: string; name: string }[], id?: string) {
  return list.find(x => x.id === id)?.name || '—';
}

export const AccountingList: React.FC = () => {
  const { companyId } = useCompany();
  const { grupos, subgrupos, categorias, marcas } = useCatalogos();
  const { usuarios, departamentos } = useOrganizacion(companyId);
  const [requests, setRequests] = React.useState<Request[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<Request | null>(null);
  const [entries, setEntries] = React.useState<ContabilidadEntry[]>([]);
  const [rejectModal, setRejectModal] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const navigate = useNavigate();

  React.useEffect(() => {
    setLoading(true);
    accountingService.getPendingApprovals(companyId).then(r => {
      setRequests(r);
      setLoading(false);
    });
  }, [companyId]);

  const filtered = search
    ? requests.filter(r => r.requestedDescription.toLowerCase().includes(search.toLowerCase()))
    : requests;

  const handleApprove = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      await accountingService.approveAccounting(
        selected.id,
        entries.map(e => ({ code: e.code, description: e.description, position: e.position })),
      );
      setSelected(null);
      setEntries([]);
      accountingService.getPendingApprovals(companyId).then(setRequests);
    } catch (err: any) {
      setError(err?.message || 'Error al aprobar la solicitud contable.');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      await accountingService.rejectAccounting(selected.id, rejectReason);
      setSelected(null);
      setRejectModal(false);
      setRejectReason('');
      accountingService.getPendingApprovals(companyId).then(setRequests);
    } catch (err: any) {
      setError(err?.message || 'Error al rechazar la solicitud.');
    } finally {
      setSaving(false);
    }
  };

  if (selected) {
    const requester = usuarios.find(u => u.id === selected.requesterId);
    const dept = departamentos.find(d => d.id === selected.departmentId);

    return (
      <div className="stack">
        <PageHeader
          title={`Aprobación Contable — ${selected.requestNumber}`}
          action={<Button variant="secondary" onClick={() => setSelected(null)}>Volver</Button>}
        />

          <WorkflowTimeline status={selected.status} />

        <div className="grid2">
          <div className="stack">
            {selected.referencePhotoUri && (
              <div className="card p16">
                <span className="muted small">Imagen referencial</span>
                <img
                  src={`/api/v1/uploads/${selected.referencePhotoUri}`}
                  alt="Imagen referencial"
                  onClick={() => setLightboxOpen(true)}
                  style={{ maxWidth: '100%', maxHeight: 250, borderRadius: 8, marginTop: 8, cursor: 'pointer', border: '1px solid var(--border)' }}
                />
                <ImageLightbox
                  src={`/api/v1/uploads/${selected.referencePhotoUri}`}
                  alt="Imagen referencial"
                  open={lightboxOpen}
                  onClose={() => setLightboxOpen(false)}
                  downloadFilename={selected.referencePhotoUri.split('/').pop()}
                />
              </div>
            )}

            <div className="card p16">
              <h3 className="h1" style={{ fontSize: 16 }}>Clasificación de Almacén</h3>
              <div className="review-grid" style={{ marginTop: 8 }}>
                <div><span className="muted small">Descripción</span><br /><strong>{selected.requestedDescription}</strong></div>
                <div><span className="muted small">Solicitante</span><br /><strong>{requester?.displayName || '—'}</strong></div>
                <div><span className="muted small">Grupo</span><br /><strong>{findName(grupos, selected.groupId)}</strong></div>
                <div><span className="muted small">Subgrupo</span><br /><strong>{findName(subgrupos, selected.subgroupId)}</strong></div>
                <div><span className="muted small">Categoría</span><br /><strong>{findName(categorias, selected.categoryId)}</strong></div>
                <div><span className="muted small">Marca</span><br /><strong>{findName(marcas, selected.brandId)}</strong></div>
                {selected.partNumber && <div><span className="muted small">Part Number</span><br /><strong>{selected.partNumber}</strong></div>}
              </div>
              <p className="muted small" style={{ marginTop: 8 }}>⚠ La clasificación fue realizada por Almacén. Contabilidad NO puede modificar grupo, subgrupo, categoría ni marca.</p>
            </div>

            <div className="card p16">
              <h3 className="h1" style={{ fontSize: 16 }}>Información Contable</h3>
              <p className="muted small" style={{ marginTop: 4, marginBottom: 12 }}>
                Posiciones c1…c10 de Profit. Seleccione una cuenta existente por posición (código y descripción vinculados).
              </p>

              <InformacionContable value={entries} onChange={setEntries} />
            </div>

            <div className="form-actions">
              <Button variant="danger" onClick={() => setRejectModal(true)} disabled={saving}>Rechazar</Button>
              <Button onClick={handleApprove} disabled={saving || entries.length === 0}>{saving ? 'Procesando...' : 'Aprobar'}</Button>
            </div>

            {error && (
              <div className="alert" style={{ marginTop: 8, background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>
                {error}
              </div>
            )}
          </div>

          <div className="side-panel">
            <div className="card p16">
              <span className="muted small">Código Master Propuesto</span>
              <div className="master-code-display" style={{ marginTop: 4 }}>
                {selected.masterCode || (selected.groupId && selected.subgroupId
                  ? `${grupos.find(g => g.id === selected.groupId)?.code || ''}${subgrupos.find(s => s.id === selected.subgroupId)?.code || ''}000001`
                  : '—')}
              </div>
            </div>
          </div>
        </div>

        <Modal open={rejectModal} onClose={() => setRejectModal(false)} title="Rechazar Clasificación">
          <div className="stack-sm">
            <p className="muted">Indique el motivo del rechazo:</p>
            <Textarea
              placeholder="Ejemplo: Código contable incorrecto, información incompleta..."
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
      <PageHeader title="Contabilidad" subtitle="Clasificaciones pendientes de aprobación contable" />

      <SearchInput value={search} onChange={setSearch} placeholder="Buscar por descripción..." />

      {loading ? (
        <div className="empty">Cargando...</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No hay clasificaciones pendientes" desc="Todas las clasificaciones han sido procesadas" />
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
                      {r.masterCode || (r.groupId && r.subgroupId
                        ? `${grupos.find(g => g.id === r.groupId)?.code || ''}${subgrupos.find(s => s.id === r.subgroupId)?.code || ''}000001`
                        : '—')}
                    </span>
                  </td>
                  <td>{usuarios.find(u => u.id === r.requesterId)?.displayName || '—'}</td>
                  <td>
                    <Button size="sm" onClick={() => { setSelected(r); setEntries([]); }}>Revisar</Button>
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
