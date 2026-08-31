import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../../contexts/SessionContext';
import { warehouseService } from '../../services';
import { analyzerProposals } from '../../mock/source-items';
import { groups, subgroups, categories, brands, units } from '../../mock/catalog';
import { PageHeader, Button, Select, Textarea, Modal } from '../../components/ui';
import { WorkflowTimeline, AnalyzerPanel, MasterCodePreview } from '../../components/workflow';
import type { Request } from '../../types';

export const WarehouseClassify: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useSession();
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

  // Get analyzer proposal for this request
  const analyzerProposal = id ? analyzerProposals[id] : null;
  const selectedGroup = groups.find(g => g.id === groupId);
  const selectedSubgroup = subgroups.find(s => s.id === subgroupId);
  const filteredSubgroups = subgroups.filter(s => s.groupId === groupId);
  const filteredCategories = categories.filter(c => c.subgroupId === subgroupId);

  const handleSave = async () => {
    if (!id) return;
    await warehouseService.saveClassification(id, {
      groupId, subgroupId, categoryId: categoryId || undefined,
      brandId: brandId || undefined, unitId: unitId || undefined,
      manufacturer: manufacturer || undefined, model: model || undefined,
      partNumber: partNumber || undefined, application: application || undefined,
    });
    setSaved(true);
  };

  const handleReturn = async () => {
    if (!id) return;
    await warehouseService.returnRequest(id, returnReason);
    setReturnModal(false);
    navigate('/warehouse');
  };

  const handleApprove = async () => {
    if (!id) return;
    await warehouseService.approveClassification(id);
    navigate('/warehouse');
  };

  if (!request) return <div className="empty">Cargando...</div>;

  return (
    <div className="stack">
      <PageHeader
        title={`Clasificación — REQ-${request.requestNumber}`}
        action={<Button variant="secondary" onClick={() => navigate('/warehouse')}>Volver</Button>}
      />

      <WorkflowTimeline status={request.status} />

      <div className="grid2">
        <div className="stack">
          {/* Request info */}
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
                  onClick={() => window.open(`/api/v1/uploads/${request.referencePhotoUri}`, '_blank')}
                  style={{ maxWidth: '100%', maxHeight: 250, borderRadius: 8, cursor: 'zoom-in', border: '1px solid var(--border)' }}
                />
              </div>
            )}
          </div>

          {/* Analyzer */}
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

          {/* Classification form */}
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
                  {groups.map(g => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
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
                  {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </label>

              <label>
                <span className="muted small">Unidad de Medida</span>
                <Select value={unitId} onChange={e => setUnitId(e.target.value)}>
                  <option value="">Seleccionar unidad</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
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

          {/* Actions */}
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setReturnModal(true)}>Devolver</Button>
            <Button variant="secondary" onClick={handleSave} disabled={saved}>{saved ? 'Guardado' : 'Guardar Borrador'}</Button>
            <Button onClick={handleApprove} disabled={!groupId || !subgroupId}>Aprobar Clasificación</Button>
          </div>
        </div>

        {/* Sidebar - Code preview */}
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
    </div>
  );
};
