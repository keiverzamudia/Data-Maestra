import * as React from 'react';
import { Can } from '../../componentes/auth/Can';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '../../contextos/CompanyContext';
import { accountingService } from '../../servicios';
import { useCatalogos } from '../../hooks/useCatalogos';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { Button, SearchInput, StatusBadge, EmptyState, Modal, Textarea, ImageLightbox, Alert, ConfirmDialog, Skeleton, ErrorState } from '../../componentes/ui';
import { Page } from '../../componentes/ui';
import { WorkflowStepper, WorkflowStatusInfo } from '../../componentes/workflow';
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
  const [listError, setListError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Request | null>(null);
  const [entries, setEntries] = React.useState<ContabilidadEntry[]>([]);
  const [rejectModal, setRejectModal] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const navigate = useNavigate();

  const loadList = React.useCallback(() => {
    setLoading(true);
    setListError(null);
    accountingService.getPendingApprovals(companyId).then(
      r => {
        setRequests(r);
        setLoading(false);
      },
      () => {
        setRequests([]);
        setListError('No pudimos cargar las clasificaciones pendientes.');
        setLoading(false);
      },
    );
  }, [companyId]);

  React.useEffect(() => { loadList(); }, [loadList]);

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
      <Page
        title={`Aprobación Contable — ${selected.requestNumber}`}
        desc={selected.requestedDescription}
        actions={<Button variant="secondary" onClick={() => setSelected(null)}>Volver</Button>}
      >
        <WorkflowStepper status={selected.status} />
        <WorkflowStatusInfo status={selected.status} />

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
              <h3 className="h1" style={{ fontSize: 16 }}>Clasificación recibida (solo lectura)</h3>
              <div className="review-grid" style={{ marginTop: 8 }}>
                <div><span className="muted small">Descripción</span><br /><strong>{selected.requestedDescription}</strong></div>
                <div><span className="muted small">Solicitante</span><br /><strong>{requester?.displayName || '—'}</strong></div>
                <div><span className="muted small">Grupo</span><br /><strong>{findName(grupos, selected.groupId)}</strong></div>
                <div><span className="muted small">Subgrupo</span><br /><strong>{findName(subgrupos, selected.subgroupId)}</strong></div>
                <div><span className="muted small">Categoría</span><br /><strong>{findName(categorias, selected.categoryId)}</strong></div>
                <div><span className="muted small">Marca</span><br /><strong>{findName(marcas, selected.brandId)}</strong></div>
                {selected.partNumber && <div><span className="muted small">Part Number</span><br /><strong>{selected.partNumber}</strong></div>}
              </div>
              <Alert tone="warning">
                La clasificación fue realizada por Almacén. Contabilidad revisa estos datos pero NO puede modificar grupo, subgrupo, categoría ni marca.
              </Alert>
            </div>

            <div className="card p16">
              <h3 className="h1" style={{ fontSize: 16 }}>Información Contable</h3>
              <p className="muted small" style={{ marginTop: 4, marginBottom: 12 }}>
                Posiciones c1…c10 de Profit. Seleccione una cuenta existente por posición (código y descripción vinculados).
              </p>

              <InformacionContable value={entries} onChange={setEntries} />
            </div>

            <div className="action-bar">
              <Can permission="ACCOUNTING.APPROVE">
                <Button variant="danger" onClick={() => setRejectModal(true)} disabled={saving}>Rechazar</Button>
                <Button onClick={() => setConfirmApprove(true)} disabled={saving || entries.length === 0}>{saving ? 'Procesando...' : 'Aprobar'}</Button>
              </Can>
            </div>

            <ConfirmDialog
              open={confirmApprove}
              title="Aprobar revisión contable"
              desc="¿Aprobar esta solicitud? Pasará a Validación Maestra con los códigos contables indicados."
              confirmLabel="Aprobar"
              busy={saving}
              onCancel={() => setConfirmApprove(false)}
              onConfirm={() => { setConfirmApprove(false); void handleApprove(); }}
            />

            {error && (
              <Alert tone="danger">{error}</Alert>
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
      </Page>
    );
  }

  return (
    <Page
      title="Contabilidad"
      desc={loading ? 'Revisa y aprueba las clasificaciones desde el punto de vista contable.' : `${filtered.length} clasificación${filtered.length === 1 ? '' : 'es'} por revisar.`}
    >
      <div className="toolbar" role="search">
        <span className="grow"><SearchInput value={search} onChange={setSearch} placeholder="Buscar por descripción..." /></span>
      </div>

      {loading && (
        <div className="card p16 stack-sm" aria-label="Cargando clasificaciones">
          <Skeleton height={16} width="30%" /><Skeleton height={40} /><Skeleton height={40} />
        </div>
      )}
      {!loading && listError && <ErrorState title="No pudimos cargar las clasificaciones pendientes." onRetry={loadList} />}
      {!loading && !listError && filtered.length === 0 && (
        <EmptyState title="No hay clasificaciones pendientes" desc="Todas las clasificaciones han sido procesadas" />
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
                      {r.masterCode || (r.groupId && r.subgroupId
                        ? `${grupos.find(g => g.id === r.groupId)?.code || ''}${subgrupos.find(s => s.id === r.subgroupId)?.code || ''}000001`
                        : '—')}
                    </span>
                  </td>
                  <td data-label="Solicitante">{usuarios.find(u => u.id === r.requesterId)?.displayName || '—'}</td>
                  <td data-label="Acción">
                    <Button size="sm" onClick={() => { setSelected(r); setEntries([]); }}>Revisar</Button>
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
