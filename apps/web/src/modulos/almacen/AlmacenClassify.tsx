import * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../../contextos/SessionContext';
import { warehouseService } from '../../servicios';
import { useCatalogos } from '../../hooks/useCatalogos';
import { useProfitCatalogos } from '../../hooks/useProfitCatalogos';
import { analyzerProposals } from '../../mock/source-items';
import { PageHeader, Button, Select, Textarea, Modal, ImageLightbox } from '../../componentes/ui';
import { WorkflowTimeline, AnalyzerPanel, MasterCodePreview } from '../../componentes/workflow';
import type { Request } from '../../tipos';

export const WarehouseClassify: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useSession();
  // Catálogo local (unidades + traducción ID→código para solicitudes existentes).
  const { grupos: localGrupos, subgrupos: localSubgrupos, categorias: localCategorias, marcas: localMarcas, unidades } = useCatalogos();
  const [request, setRequest] = React.useState<Request | null>(null);
  // Códigos Profit directos (FASE 8F): el subgrupo se identifica por (grupo, subgrupo).
  const [groupCode, setGroupCode] = React.useState('');
  const [subgroupCode, setSubgroupCode] = React.useState('');
  const [categoryCode, setCategoryCode] = React.useState('');
  const [categoryName, setCategoryName] = React.useState('');
  const [brandCode, setBrandCode] = React.useState('');
  const [brandName, setBrandName] = React.useState('');
  // IDs legacy de la solicitud (compatibilidad histórica): se envían solo si
  // el usuario no elige un código Profit nuevo para ese campo.
  const [legacyCategoryId, setLegacyCategoryId] = React.useState('');
  const [legacyBrandId, setLegacyBrandId] = React.useState('');
  const [unitId, setUnitId] = React.useState('');
  const {
    grupos: pGrupos, subgrupos: pSubgrupos, categorias: pCategorias, marcas: pMarcas,
    loading: loadingProfit, error: profitError,
  } = useProfitCatalogos(groupCode || undefined);
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

  // Prefill: traduce IDs locales guardados a códigos Profit (el catálogo local
  // cubre los códigos Profit, verificado en FASE 8F).
  const idToCode = React.useCallback((kind: 'group' | 'subgroup' | 'category' | 'brand', valueId?: string) => {
    if (!valueId) return { code: '', name: '' };
    if (kind === 'group') {
      const g = localGrupos.find(x => x.id === valueId);
      return { code: g?.code ?? '', name: g?.name ?? '' };
    }
    if (kind === 'subgroup') {
      const s = localSubgrupos.find(x => x.id === valueId);
      return { code: s?.code ?? '', name: s?.name ?? '' };
    }
    if (kind === 'category') {
      const c = localCategorias.find(x => x.id === valueId);
      return { code: c?.code ?? '', name: c?.name ?? '' };
    }
    const b = localMarcas.find(x => x.id === valueId);
    return { code: '', name: b?.name ?? '' };
  }, [localGrupos, localSubgrupos, localCategorias, localMarcas]);

  // El prefill solo se aplica una vez: nunca debe pisar la selección del usuario
  // aunque los catálogos se recarguen.
  const prefilledRef = React.useRef(false);

  React.useEffect(() => {
    if (id && !prefilledRef.current) {
      warehouseService.getRequestForClassification(id).then(r => {
        if (prefilledRef.current) return;
        prefilledRef.current = true;
        if (r) {
          setRequest(r);
          setGroupCode(idToCode('group', r.groupId).code);
          setSubgroupCode(idToCode('subgroup', r.subgroupId).code);
          const cat = idToCode('category', r.categoryId);
          setCategoryCode(cat.code);
          setCategoryName(cat.name);
          if (r.categoryId) setLegacyCategoryId(r.categoryId);
          const brand = idToCode('brand', r.brandId);
          setBrandCode(brand.code);
          setBrandName(brand.name);
          if (r.brandId) setLegacyBrandId(r.brandId);
          if (r.unitId) setUnitId(r.unitId);
          if (r.manufacturer) setManufacturer(r.manufacturer);
          if (r.model) setModel(r.model);
          if (r.partNumber) setPartNumber(r.partNumber);
          if (r.application) setApplication(r.application);
        }
      });
    }
  }, [id, idToCode]);

  const analyzerProposal = id ? analyzerProposals[id] : null;
  // El backend ya filtra subgrupos por grupo (co_lin); la lista es del grupo.
  const filteredSubgroups = pSubgrupos;

  const buildPayload = () => ({
    groupCode, subgroupCode,
    categoryCode: categoryCode || undefined,
    categoryName: categoryName || undefined,
    brandCode: brandCode || undefined,
    brandName: brandName || undefined,
    // Compatibilidad histórica: solo si no se eligió código Profit nuevo.
    categoryId: !categoryCode && legacyCategoryId ? legacyCategoryId : undefined,
    brandId: !brandCode && legacyBrandId ? legacyBrandId : undefined,
    unitId: unitId || undefined,
    manufacturer: manufacturer || undefined, model: model || undefined,
    partNumber: partNumber || undefined, application: application || undefined,
  });

  const handleSave = async () => {
    if (!id || saving) return;
    setSaving(true);
    setError(null);
    try {
      await warehouseService.saveClassification(id, buildPayload());
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
      await warehouseService.saveClassification(id, buildPayload());
      await warehouseService.approveClassification(id);
      navigate('/warehouse');
    } catch (err: any) {
      setError(err?.message || 'Error al procesar la clasificación.');
    } finally {
      setSaving(false);
    }
  };

  if (!request || loadingProfit) return <div className="empty">Cargando...</div>;

  return (
    <div className="stack">
      <PageHeader
        title={`Clasificación — ${request.requestNumber}`}
        action={<Button variant="secondary" onClick={() => navigate('/warehouse')}>Volver</Button>}
      />

      <WorkflowTimeline status={request.status} />

      {/* Rejection note from accounting — E-05 fix: último RETURN/REJECT */}
      {request.status === 'PENDIENTE_ALMACEN' && request.approvals && (
        (() => {
          const candidates = request.approvals!
            .filter((a) => (a.action === 'RETURN' || a.action === 'REJECT') && a.comment)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          const lastRejection = candidates[0];
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
              Catálogos directos desde Profit. El subgrupo depende del grupo;
              categoría y marca son independientes.
            </p>

            {profitError && (
              <div className="alert" style={{ marginBottom: 12, background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>
                No se pudieron cargar los catálogos de Profit: {profitError}
              </div>
            )}

            <div className="alert" style={{ marginBottom: 12 }}>
              El cambio de clasificación modifica el código propuesto.
            </div>

            <div className="form-grid">
              <label>
                <span className="muted small">Grupo (Profit)</span>
                <Select value={groupCode} onChange={e => { setGroupCode(e.target.value.trim()); setSubgroupCode(''); }}>
                  <option value="">Seleccionar grupo</option>
                  {pGrupos.map(g => <option key={g.co_lin.trim()} value={g.co_lin.trim()}>{g.co_lin.trim()} — {g.lin_des.trim()}</option>)}
                </Select>
              </label>

              <label>
                <span className="muted small">Subgrupo (del grupo seleccionado)</span>
                <Select value={subgroupCode} onChange={e => setSubgroupCode(e.target.value.trim())} disabled={!groupCode}>
                  <option value="">Seleccionar subgrupo</option>
                  {filteredSubgroups.map(s => <option key={`${s.co_lin.trim()}/${s.co_subl.trim()}`} value={s.co_subl.trim()}>{s.co_subl.trim()} — {s.subl_des.trim()}</option>)}
                </Select>
              </label>

              <label>
                <span className="muted small">Categoría (Profit, independiente)</span>
                <Select
                  value={categoryCode}
                  onChange={e => {
                    const code = e.target.value.trim();
                    const found = pCategorias.find(c => c.co_cat.trim() === code);
                    setCategoryCode(code);
                    setCategoryName(found ? found.cat_des.trim() : '');
                    setLegacyCategoryId('');
                  }}
                >
                  <option value="">Seleccionar categoría</option>
                  {pCategorias.map(c => <option key={c.co_cat.trim()} value={c.co_cat.trim()}>{c.co_cat.trim()} — {c.cat_des.trim()}</option>)}
                </Select>
              </label>

              <label>
                <span className="muted small">Marca (Profit colores, independiente)</span>
                <Select
                  value={brandCode}
                  onChange={e => {
                    const code = e.target.value.trim();
                    const found = pMarcas.find(m => m.co_col.trim() === code);
                    setBrandCode(code);
                    setBrandName(found ? found.des_col.trim() : '');
                    setLegacyBrandId('');
                  }}
                >
                  <option value="">Seleccionar marca</option>
                  {pMarcas.map(m => <option key={m.co_col.trim()} value={m.co_col.trim()}>{m.co_col.trim()} — {m.des_col.trim()}</option>)}
                </Select>
                {!brandCode && legacyBrandId && brandName && (
                  <span className="muted small" style={{ marginTop: 4 }}>Marca guardada: {brandName} (catálogo anterior)</span>
                )}
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
            <Button onClick={handleApprove} disabled={saving || !groupCode || !subgroupCode}>{saving ? 'Procesando...' : 'Aprobar Clasificación'}</Button>
          </div>

          {error && (
            <div className="alert" style={{ marginTop: 8, background: '#fee2e2', borderColor: '#fca5a5', color: '#991b1b' }}>
              {error}
            </div>
          )}
        </div>

        <div className="side-panel">
          <MasterCodePreview groupCode={groupCode} subgroupCode={subgroupCode} />

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
