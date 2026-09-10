import * as React from 'react';
import { Can } from '../../componentes/auth/Can';
import { useNavigate, useParams } from 'react-router-dom';
import { warehouseService } from '../../servicios';
import { useCatalogos } from '../../hooks/useCatalogos';
import { useProfitCatalogos } from '../../hooks/useProfitCatalogos';
import type { DryRunResult } from '../../contratos';
import { analyzerProposals } from '../../mock/source-items';
import { Button, Select, Textarea, Modal, ImageLightbox, Alert, ConfirmDialog, Field, StatusBadge, Skeleton } from '../../componentes/ui';
import { Page } from '../../componentes/ui';
import { WorkflowStepper, WorkflowStatusInfo, AnalyzerPanel, MasterCodePreview } from '../../componentes/workflow';
import type { Request } from '../../tipos';

export const WarehouseClassify: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Catálogo local (traducción ID→código para solicitudes existentes; la unidad
  // de venta ahora viene de Profit: pUnidades).
  const { grupos: localGrupos, subgrupos: localSubgrupos, categorias: localCategorias, marcas: localMarcas } = useCatalogos();
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
  // FASE 14C-FORM: tipo (Profit, nunca manual), impuesto (tipo_imp, no co_imp),
  // unidad Profit (valida trigger TrigI_art). articleTypeManual = override de
  // Warehouse sobre el default sugerido de la línea (§18).
  const [articleType, setArticleType] = React.useState('');
  const [articleTypeManual, setArticleTypeManual] = React.useState(false);
  const [groupDefaultType, setGroupDefaultType] = React.useState<string | null>(null);
  const [taxType, setTaxType] = React.useState('');
  const [taxTouched, setTaxTouched] = React.useState(false);
  const [unitCode, setUnitCode] = React.useState('');
  const [dryRun, setDryRun] = React.useState<DryRunResult | null>(null);
  const [validating, setValidating] = React.useState(false);
  // manualRef=true si Warehouse eligió el tipo a mano (§18: no sobrescribir).
  const manualRef = React.useRef(false);
  const {
    grupos: pGrupos, subgrupos: pSubgrupos, categorias: pCategorias, marcas: pMarcas,
    tipos: pTipos, tasas: pTasas, unidadesProfit: pUnidades, defaultType: lineDefaultType,
    loading: loadingProfit, error: profitError,
  } = useProfitCatalogos(groupCode || undefined);
  const [partNumber, setPartNumber] = React.useState('');
  const [application, setApplication] = React.useState('');
  const [returnModal, setReturnModal] = React.useState(false);
  const [returnReason, setReturnReason] = React.useState('');
  const [confirmApprove, setConfirmApprove] = React.useState(false);
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
          // 14C-FORM: prefill de clasificación Profit guardada (nunca pisa al usuario).
          if (r.articleType) { setArticleType(r.articleType); setArticleTypeManual(!!r.articleTypeManual); manualRef.current = !!r.articleTypeManual; }
          if (r.taxType) { setTaxType(r.taxType); setTaxTouched(true); }
          if (r.unitCode) setUnitCode(r.unitCode);
          if (r.partNumber) setPartNumber(r.partNumber);
          if (r.application) setApplication(r.application);
        }
      });
    }
  }, [id, idToCode]);

  // El dry-run caduca si cambia cualquier dato clasificado.
  React.useEffect(() => { setDryRun(null); }, [groupCode, subgroupCode, articleType, unitCode, taxType]);

  const analyzerProposal = id ? analyzerProposals[id] : null;
  // El backend ya filtra subgrupos por grupo (co_lin); la lista es del grupo.
  const filteredSubgroups = pSubgrupos;

  // Tasa derivada por regla confirmada 14B (C/V→1, S→6). Sugerencia con
  // excepciones reales: desviarse muestra advertencia, no bloquea.
  const derivedTax = articleType === 'S' ? '6' : articleType ? '1' : '';
  const effectiveTax = taxType || derivedTax;
  const taxWarning = effectiveTax && derivedTax && effectiveTax !== derivedTax
    ? `El tipo ${articleType} suele usar tasa ${derivedTax}; se indicó ${effectiveTax} (excepción válida en Profit, verificar).`
    : null;

  // Default de tipo por línea (§6-§7: sugerido, nunca obligatorio).
  // lineDefaultType llega con los catálogos ya filtrados por grupo.
  React.useEffect(() => {
    setGroupDefaultType(groupCode ? lineDefaultType : null);
    if (groupCode && !manualRef.current) setArticleType(lineDefaultType ?? '');
  }, [groupCode, lineDefaultType]);

  const handleGroupChange = (code: string) => {
    setGroupCode(code);
    setSubgroupCode('');
    // §18: con override manual se conserva el tipo; sin él se liberará al
    // nuevo default cuando llegue la sugerencia de la línea.
    if (!manualRef.current) setArticleType('');
  };

  const handleTypeChange = (code: string) => {
    setArticleType(code);
    const manual = !!code && code !== groupDefaultType;
    manualRef.current = manual;
    setArticleTypeManual(manual);
    // §19: el impuesto sigue al tipo salvo edición manual previa.
    if (!taxTouched) setTaxType('');
  };

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
    // 14C-FORM: clasificación Profit del artículo.
    articleType: articleType || undefined,
    articleTypeManual,
    taxType: effectiveTax || undefined,
    unitCode: unitCode || undefined,
    partNumber: partNumber || undefined, application: application || undefined,
  });

  const canApprove = !!groupCode && !!subgroupCode && !!articleType && !!unitCode;

  const handleValidate = async () => {
    if (!id || validating) return;
    setValidating(true);
    setError(null);
    try {
      const result = await warehouseService.validateArticle(id, buildPayload());
      setDryRun(result);
    } catch (err: any) {
      setError(err?.message || 'Error al validar el artículo.');
    } finally {
      setValidating(false);
    }
  };

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

  if (!request || loadingProfit) return <Page title="Clasificación"><Skeleton height={20} width="40%" /><Skeleton height={36} /><Skeleton height={120} /></Page>;

  return (
    <Page
      title={`Clasificación — ${request.requestNumber}`}
      desc={request.requestedDescription}
      actions={<><StatusBadge status={request.status} /><Button variant="secondary" onClick={() => navigate('/warehouse')}>Volver</Button></>}
    >
      <WorkflowStepper status={request.status} />
      <WorkflowStatusInfo status={request.status} />

      {/* Rejection note from accounting — E-05 fix: último RETURN/REJECT */}
      {request.status === 'PENDIENTE_ALMACEN' && request.approvals && (
        (() => {
          const candidates = request.approvals!
            .filter((a) => (a.action === 'RETURN' || a.action === 'REJECT') && a.comment)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          const lastRejection = candidates[0];
          if (lastRejection) {
            return (
              <Alert tone="danger">
                <div className="callout" style={{ paddingLeft: 8 }}>
                  <strong>Observación de Contabilidad</strong>
                  <p style={{ marginTop: 8, fontWeight: 600 }}>{lastRejection.comment}</p>
                  <p className="muted small" style={{ marginTop: 4 }}>
                    {lastRejection.actor?.displayName || '—'} · {new Date(lastRejection.createdAt).toLocaleString('es-VE')}
                  </p>
                </div>
              </Alert>
            );
          }
          return null;
        })()
      )}

      <div className="grid2">
        <div className="stack">
          <div className="card p16">
            <h3 className="h1" style={{ fontSize: 16 }}>Información recibida</h3>
            <p className="muted small read-only-note">Datos de la solicitud. Solo lectura: Almacén no modifica la descripción original.</p>
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
              <Alert tone="danger">
                No se pudieron cargar los catálogos de Profit: {profitError}
              </Alert>
            )}

            <Alert tone="info">
              El cambio de clasificación modifica el código propuesto.
            </Alert>

            <div className="form-grid">
              <Field label="Tipo de artículo (Profit)" required>
                <Select value={articleType} onChange={e => handleTypeChange(e.target.value.trim())}>
                  <option value="">Seleccionar tipo</option>
                  <optgroup label="Funcionales">
                    {pTipos.filter(t => t.functional).map(t => (
                      <option key={t.code.trim()} value={t.code.trim()}>{t.code.trim()} — {t.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Reservados (válidos en Profit, sin uso confirmado)">
                    {pTipos.filter(t => !t.functional).map(t => (
                      <option key={t.code.trim()} value={t.code.trim()}>{t.code.trim()} — {t.label}</option>
                    ))}
                  </optgroup>
                </Select>
                {groupDefaultType && !articleTypeManual && articleType && (
                  <span className="muted small" style={{ marginTop: 4 }}>Sugerido por la línea {groupCode}.</span>
                )}
                {articleTypeManual && (
                  <span className="muted small" style={{ marginTop: 4 }}>El tipo fue seleccionado manualmente.</span>
                )}
              </Field>

              <Field label="Grupo (Profit)" required>
                <Select value={groupCode} onChange={e => handleGroupChange(e.target.value.trim())}>
                  <option value="">Seleccionar grupo</option>
                  {pGrupos.map(g => <option key={g.co_lin.trim()} value={g.co_lin.trim()}>{g.co_lin.trim()} — {g.lin_des.trim()}</option>)}
                </Select>
              </Field>

              <Field label="Subgrupo (del grupo seleccionado)" required>
                <Select value={subgroupCode} onChange={e => setSubgroupCode(e.target.value.trim())} disabled={!groupCode}>
                  <option value="">Seleccionar subgrupo</option>
                  {filteredSubgroups.map(s => <option key={`${s.co_lin.trim()}/${s.co_subl.trim()}`} value={s.co_subl.trim()}>{s.co_subl.trim()} — {s.subl_des.trim()}</option>)}
                </Select>
              </Field>

              <label>
                <span className="muted small">Categoría (Profit, independiente — 01 = NO APLICA)</span>
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

              <Field label="Unidad de venta (Profit)" required>
                <Select value={unitCode} onChange={e => setUnitCode(e.target.value.trim())}>
                  <option value="">Seleccionar unidad</option>
                  {pUnidades.map(u => <option key={u.co_uni.trim()} value={u.co_uni.trim()}>{u.co_uni.trim()} — {u.des_uni.trim()}</option>)}
                </Select>
              </Field>

              <Field label="Impuesto (tipo_imp Profit)">
                <Select
                  value={effectiveTax}
                  onChange={e => { setTaxType(e.target.value.trim()); setTaxTouched(true); }}
                >
                  <option value="">Derivar por regla</option>
                  {pTasas.map(t => <option key={t.tipo.trim()} value={t.tipo.trim()}>{t.tipo.trim()} — {t.descripcio}</option>)}
                </Select>
                {taxWarning && (
                  <span className="muted small" style={{ marginTop: 4 }}>{taxWarning}</span>
                )}
                {!taxWarning && derivedTax && (
                  <span className="muted small" style={{ marginTop: 4 }}>Valor que utilizará Profit: tasa {effectiveTax}.</span>
                )}
              </Field>

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

          <div className="action-bar">
            <Can permission="WAREHOUSE.CLASSIFY">
              <Button variant="ghost" onClick={() => setReturnModal(true)} disabled={saving}>Devolver</Button>
              <Button variant="secondary" onClick={handleSave} disabled={saving || saved}>{saving ? 'Guardando...' : saved ? 'Guardado' : 'Guardar Borrador'}</Button>
              <Button variant="secondary" onClick={handleValidate} disabled={validating || saving}>{validating ? 'Validando...' : 'Validar artículo'}</Button>
              <Button onClick={() => setConfirmApprove(true)} disabled={saving || !canApprove}>{saving ? 'Procesando...' : 'Aprobar Clasificación'}</Button>
            </Can>
          </div>
          {!canApprove && (
            <p className="muted small" style={{ marginTop: 8 }}>
              Para aprobar se requieren grupo, subgrupo, tipo de artículo y unidad Profit.
            </p>
          )}

          {/* Datos listos para Profit (§23): solo lectura, sin botón de escritura. */}
          <div className="card p16" style={{ marginTop: 12 }}>
            <h3 className="h1" style={{ fontSize: 16 }}>Datos listos para Profit</h3>
            <p className="muted small" style={{ marginTop: 4, marginBottom: 12 }}>
              Verificación previa a la futura escritura. No escribe en Profit.
            </p>
            {!dryRun ? (
              <p className="muted small">Pulse «Validar artículo» para ejecutar la validación completa.</p>
            ) : (
              <div className="stack-sm">
                <p style={{ fontWeight: 700, color: dryRun.ready ? 'var(--success, green)' : 'var(--danger, red)' }}>
                  {dryRun.ready ? 'ARTÍCULO LISTO' : 'ARTÍCULO NO LISTO'}
                </p>
                {dryRun.checks.map(c => (
                  <div key={c.key} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span aria-hidden>{c.status === 'COMPLETO' ? '✓' : c.status === 'NO_APLICA' ? '–' : '✗'}</span>
                    <div>
                      <strong>{c.label}:</strong> {c.status}
                      {c.detail && <span className="muted small"> — {c.detail}</span>}
                    </div>
                  </div>
                ))}
                {dryRun.warnings.map((w, i) => (
                  <Alert key={i} tone="info">{w}</Alert>
                ))}
                {dryRun.wouldProvision.length > 0 && (
                  <p className="muted small">Al guardar se completarían en catálogo local: {dryRun.wouldProvision.join(', ')}.</p>
                )}
              </div>
            )}
          </div>

          <ConfirmDialog
            open={confirmApprove}
            title="Aprobar clasificación"
            desc="¿Aprobar esta clasificación? La solicitud pasará a Contabilidad para su revisión."
            confirmLabel="Aprobar y enviar"
            busy={saving}
            onCancel={() => setConfirmApprove(false)}
            onConfirm={() => { setConfirmApprove(false); void handleApprove(); }}
          />

          {error && (
            <Alert tone="danger">{error}</Alert>
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
        <div className="toast toast-success" role="status">
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
    </Page>
  );
};
