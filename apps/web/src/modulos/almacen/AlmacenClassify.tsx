import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../../contextos/SessionContext';
import { warehouseService } from '../../servicios';
import { useCatalogos } from '../../hooks/useCatalogos';
import { analyzerProposals } from '../../mock/source-items';
import { PageHeader, Button, Select, Textarea, Modal, ImageLightbox } from '../../componentes/ui';
import { WorkflowTimeline, AnalyzerPanel, MasterCodePreview } from '../../componentes/workflow';
import type { Request } from '../../tipos';

export const WarehouseClassify: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useSession();
  const { grupos, subgrupos, categorias, marcas, unidades, loading: loadingCatalogs } = useCatalogos();
  const [request, setRequest] = React.useState<Request | null>(null);
  const [groupId, setGroupId] = React.useState('');
  const [subgroupId, setSubgroupId] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('');
  const [brandId, setBrandId] = React.useState('');
  const [unitId, setUnitId] = React.useState('');
  const [manufacturer, setManufacturer] = React.useState('');
  const [model, setModel] = React.useState('');
  const [partNumber, setPartNumber] = React.useState('');
  const [application, setApplication] = React.useState('');
  const [returnModal, setReturnModal] = React.useState(false);
  const [returnReason, setReturnReason] = React.useState('');
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);

  React.useEffect(() => {
    if (id) {
      warehouseService.getRequestForClassification(id).then(r => {
        if (r) {
          setRequest(r);
          if (r.groupId) setGroupId(r.groupId);
          if (r.subgroupId) setSubgroupId(r.subgroupId);
          if (r.categoryId) setCategoryId(r.categoryId);
          if (r.brandId) setBrandId(r.brandId);
          if (r.unitId) setUnitId(r.unitId);
          if (r.manufacturer) setManufacturer(r.manufacturer);
          if (r.model) setModel(r.model);
          if (r.partNumber) setPartNumber(r.partNumber);
          if (r.application) setApplication(r.application);
        }
      });
    }
  }, [id]);

  const analyzerProposal = id ? analyzerProposals[id] : null;
  const filteredSubgroups = subgrupos.filter(s => s.groupId === groupId);
  const filteredCategories = categorias.filter(c => c.subgroupId === subgroupId);

  const handleSave = async () => {
    if (!id || saving) return;
    setSaving(true);
    setError(null);
    try {
      await warehouseService.saveClassification(id, {
        groupId, subgroupId, categoryId: categoryId || undefined,
        brandId: brandId || undefined, unitId: unitId || undefined,
        manufacturer: manufacturer || undefined, model: model || undefined,
        partNumber: partNumber || undefined, application: application || undefined,
      });
      setSaved(true);
    } catch (err: any) {
      setError(err?.message || 'Error al guardar la clasificación.');
    } finally {
      setSaving(false);
    }
  };

  const handleReturn = async () => {
    if (!id) return;
    await warehouseService.returnRequest(id, returnReason);
    setReturnModal(false);
    navigate('/warehouse');
  };

  const handleApprove = async () => {
    if (!id || saving) return;
    setSaving(true);
    setError(null);
    try {
      await warehouseService.saveClassification(id, {
        groupId, subgroupId, categoryId: categoryId || undefined,
        brandId: brandId || undefined, unitId: unitId || undefined,
        manufacturer: manufacturer || undefined, model: model || undefined,
        partNumber: partNumber || undefined, application: application || undefined,
      });
      await warehouseService.approveClassification(id);
      navigate('/warehouse');
    } catch (err: any) {
      setError(err?.message || 'Error al procesar la clasificación.');
    } finally {
      setSaving(false);
    }
  };

  if (!request || loadingCatalogs) return <div className="empty">Cargando...</div>;

  return (
    <div className="stack">
      <PageHeader
        title={`Clasificación — ${request.requestNumber}`}
        action={<Button variant="secondary" onClick={() => navigate('/warehouse')}>Volver</Button>}
      />

      <WorkflowTimeline status={request.status} />

      {/* Rejection note from accounting */}
      {request.status === 'PENDING_WAREHOUSE' && request.approvals && (
        (() => {
          const lastRejection = request.approvals!.find(
            (a) => (a.action === 'RETURN' || a.action === 'REJECT') && a.comment
          );
          if (lastRejection) {
            return (
              <div className="card p16" style={{ borderLeft: '4px solid #dc2626' }}>
                <h3 className="h1" style={{ fontSize: 16, color: '#dc2626' }}>Observación de Contabilidad</h3>
                <p style={{ marginTop: 8, fontWeight: 600 }}>{lastRejection.comment}</p>
                <p className="muted small" style={{ marginTop: 4 }}>
                  {lastRejection.actor?.displayName || '—'} · {new Date(lastRejection.createdAt).toLocaleString('es-VE')}
                </p>
              </div>
            );
          }
          return null;
        })()
      )}

      <div className="grid2">
        <div className="stack">
          <div className="card p16">
            <h3 className="h1" style={{ fontSize: 16 }}>Solicitud</h3>
            <div style={{ marginTop: 8 }}>
              <span className="muted small">Descripción original</span>
              <p style={{ marginTop: 4, fontWeight: 600 }}>{request.requestedDescription}</p>
            </div>
            {request.referencePhotoUri && (
              <div style={{ marginTop: 12 }}>
                <span className="muted small" style={{ display: 'block', marginBottom: 4 }}>Imagen referencial</span>
                <img
                  src={`/api/v1/uploads/${request.referencePhotoUri}`}
                  alt="Imagen referencial"
                  onClick={() => setLightboxOpen(true)}
                  style={{ maxWidth: '100%', maxHeight: 250, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border)' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                />
              </div>
            )}
          </div>

          {analyzerProposal && (
            <AnalyzerPanel
              groupCode={analyzerProposal.groupCode}
              subgroupCode={analyzerProposal.subgroupCode}
              brand={analyzerProposal.brand}
              application={analyzerProposal.application}
              confidence={analyzerProposal.confidence}
              evidence={analyzerProposal.evidence}
            />
          )}

          <div className="card p16">
            <h3 className="h1" style={{ fontSize: 16 }}>Clasificación</h3>
            <p className="muted small" style={{ marginTop: 4, marginBottom: 12 }}>
              Seleccione o corrija la clasificación propuesta por el analizador.
            </p>

            <div className="alert" style={{ marginBottom: 12 }}>
              El cambio de clasificación modifica el código propuesto.
            </div>

            <div className="form-grid">
              <label>
                <span className="muted small">Grupo</span>
                <Select value={groupId} onChange={e => { setGroupId(e.target.value); setSubgroupId(''); setCategoryId(''); }}>
                  <option value="">Seleccionar grupo</option>
                  {grupos.map(g => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
                </Select>
              </label>

              <label>
                <span className="muted small">Subgrupo</span>
                <Select value={subgroupId} onChange={e => { setSubgroupId(e.target.value); setCategoryId(''); }} disabled={!groupId}>
                  <option value="">Seleccionar subgrupo</option>
                  {filteredSubgroups.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </Select>
              </label>

              <label>
                <span className="muted small">Categoría</span>
                <Select value={categoryId} onChange={e => setCategoryId(e.target.value)} disabled={!subgroupId}>
                  <option value="">Seleccionar categoría</option>
                  {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                </Select>
              </label>

              <label>
                <span className="muted small">Marca</span>
                <Select value={brandId} onChange={e => setBrandId(e.target.value)}>
                  <option value="">Seleccionar marca</option>
                  {marcas.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </label>

              <label>
                <span className="muted small">Unidad de Medida</span>
                <Select value={unitId} onChange={e => setUnitId(e.target.value)}>
                  <option value="">Seleccionar unidad</option>
                  {unidades.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
                </Select>
              </label>

              <label>
                <span className="muted small">Fabricante</span>
                <input className="input" value={manufacturer} onChange={e => setManufacturer(e.target.value)} placeholder="Fabricante" />
              </label>

              <label>
                <span className="muted small">Modelo</span>
                <input className="input" value={model} onChange={e => setModel(e.target.value)} placeholder="Modelo" />
              </label>

              <label>
                <span className="muted small">Part Number</span>
                <input className="input" value={partNumber} onChange={e => setPartNumber(e.target.value)} placeholder="Part Number" />
              </label>
            </div>

            <label style={{ marginTop: 12, display: 'block' }}>
              <span className="muted small">Aplicación</span>
              <input className="input" value={application} onChange={e => setApplication(e.target.value)} placeholder="Aplicación del artículo" />
            </label>
          </div>

          <div className="form-actions">
            <Button variant="ghost" onClick={() => setReturnModal(true)} disabled={saving}>Devolver</Button>
            <Button variant="secondary" onClick={handleSave} disabled={saving || saved}>{saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar Borrador'}</Button>
            <Button onClick={handleApprove} disabled={saving || !groupId || !subgroupId}>{saving ? 'Procesando...' : 'Aprobar Clasificación'}</Button>
          </div>

          {error && (
            <div className="alert" style={{ marginTop: 8, background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>
              {error}
            </div>
          )}
        </div>

        <div className="side-panel">
          <MasterCodePreview groupId={groupId} subgroupId={subgroupId} />

          {request.groupId && (
            <div className="card p16" style={{ marginTop: 12 }}>
              <span className="muted small">Código de Origen (Profit)</span>
              <div className="master-code-display" style={{ fontSize: 14, marginTop: 4 }}>
                {request.partNumber || '—'}
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal open={returnModal} onClose={() => setReturnModal(false)} title="Devolver Solicitud">
        <div className="stack-sm">
          <p className="muted">Indique el motivo de la devolución:</p>
          <Textarea
            placeholder="Ejemplo: Descripción insuficiente, falta información..."
            value={returnReason}
            onChange={e => setReturnReason(e.target.value)}
            rows={3}
          />
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setReturnModal(false)}>Cancelar</Button>
            <Button variant="danger" onClick={handleReturn} disabled={!returnReason.trim()}>Devolver</Button>
          </div>
        </div>
      </Modal>

      {saved && (
        <div className="alert" style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 100 }}>
          ✓ Borrador guardado
        </div>
      )}

      {request.referencePhotoUri && (
        <ImageLightbox
          src={`/api/v1/uploads/${request.referencePhotoUri}`}
          alt="Imagen referencial"
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          downloadFilename={request.referencePhotoUri.split('/').pop()}
        />
      )}
    </div>
  );
};
