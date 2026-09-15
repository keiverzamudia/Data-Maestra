import * as React from 'react';
import { Can } from '../../componentes/auth/Can';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';
import { useNavigate, useParams } from 'react-router-dom';
import { warehouseService, auditService } from '../../servicios';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { useCatalogos } from '../../hooks/useCatalogos';
import { useProfitCatalogos } from '../../hooks/useProfitCatalogos';
import type { DryRunResult } from '../../contratos';
import { analyzerProposals } from '../../mock/source-items';
import { Button, Select, Textarea, Modal, ImageLightbox, Alert, ConfirmDialog, Field, StatusBadge, Skeleton, SectionCard } from '../../componentes/ui';
import { Page } from '../../componentes/ui';
import { HelpButton, HelpFieldInfo } from '../../componentes/ayuda';
import { WorkflowStepper, WorkflowStatusInfo, AnalyzerPanel, MasterCodePreview } from '../../componentes/workflow';
import type { Request } from '../../tipos';

export const WarehouseClassify: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useSession();
  const { companyId } = useCompany();
  const { usuarios } = useOrganizacion(companyId);
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
  } = useProfitCatalogos(groupCode || undefined, companyId || undefined);
  const [partNumber, setPartNumber] = React.useState('');
  const [application, setApplication] = React.useState('');
  const [returnModal, setReturnModal] = React.useState(false);
  const [returnReason, setReturnReason] = React.useState('');
  const [confirmApprove, setConfirmApprove] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  // Quién clasificó (auditoría CLASSIFIED, tolerante a fallos).
  const [classifiedBy, setClassifiedBy] = React.useState<string | null>(null);

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

  // Clasificador real (auditoría); el estado de negocio siempre viene del request.
  React.useEffect(() => {
    if (!request) return;
    let cancelled = false;
    auditService.getEvents({ entityId: request.id, action: 'CLASSIFIED' }).then(
      (res) => {
        if (cancelled) return;
        const actorId = res.data[0]?.actorId;
        setClassifiedBy(actorId ? (usuarios.find(u => u.id === actorId)?.displayName ?? null) : null);
      },
      () => { if (!cancelled) setClassifiedBy(null); },
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id]);

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
    // Defensa en profundidad: el backend también valida estado y permiso.
    if (!id || validating || request?.status !== 'PENDIENTE_ALMACEN') return;
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
    if (!id || saving || request?.status !== 'PENDIENTE_ALMACEN') return;
    setSaving(true);
    setError(null);
    try {
      await warehouseService.saveClassification(id, buildPayload());
      setSaved(true);
      // El backend ya promovió a ALMACEN_APROBADO: refrescar para que la
      // vista cambie a solo lectura sin depender de navegación ni de F5.
      await warehouseService.getRequestForClassification(id).then(r => { if (r) setRequest(r); });
    } catch (err: any) {
      setError(err?.message || 'Error al guardar la clasificación.');
    } finally {
      setSaving(false);
    }
  };

  const handleReturn = async () => {
    if (!id || request?.status !== 'PENDIENTE_ALMACEN') return;
    await warehouseService.returnRequest(id, returnReason);
    setReturnModal(false);
    navigate('/warehouse');
  };

  const handleApprove = async () => {
    if (!id || saving || request?.status !== 'PENDIENTE_ALMACEN') return;
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

  // Regla de estado (el estado real viene de la API en cada carga, nunca solo
  // de estado local): PENDIENTE_ALMACEN = clasificación activa; cualquier otro
  // estado = solo lectura. El permiso se evalúa conjuntamente con el estado.
  const isPendingWarehouse = request.status === 'PENDIENTE_ALMACEN';
  const canEditClassification = hasPermission('WAREHOUSE.CLASSIFY') && isPendingWarehouse;

  return (
    <Page
      title={`Clasificación — ${request.requestNumber}`}
      desc={request.requestedDescription}
      actions={<><HelpButton helpKey="almacen-classify" status={request.status} /><StatusBadge status={request.status} /><Button variant="secondary" onClick={() => navigate('/warehouse')}>Volver</Button></>}
    >
      <WorkflowStepper status={request.status} />
      <WorkflowStatusInfo status={request.status} />

      {/* Clasificación terminada: enviada al Encargado de Almacén. */}
      {!isPendingWarehouse && (
        <Alert tone="info">
          <strong>Clasificación enviada</strong>
          <p className="muted small" style={{ marginTop: 4 }}>
            Esta solicitud fue clasificada y está pendiente de aprobación del Encargado de Almacén.
          </p>
          {classifiedBy && <p className="muted small">Clasificada por: {classifiedBy}</p>}
        </Alert>
      )}

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
                <div className="callout callout-pad">
                  <strong>Observación de Contabilidad</strong>
                  <p className="callout-comment">{lastRejection.comment}</p>
                  <p className="muted small field-note">
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
        <SectionCard
          title="Información recibida"
          desc="Datos de la solicitud. Solo lectura: Almacén no modifica la descripción original."
        >
            <div>
              <span className="muted small">Descripción original</span>
              <p className="received-desc">{request.requestedDescription}</p>
            </div>
            {request.referencePhotoUri && (
              <div className="block-mt">
                <span className="muted small field-label-block">Imagen referencial</span>
                <img
                  src={`/api/v1/uploads/${request.referencePhotoUri}`}
                  alt="Imagen referencial"
                  onClick={() => setLightboxOpen(true)}
                  className="evidence-thumb evidence-action"
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                />
              </div>
            )}
        </SectionCard>

        <div className="stack" aria-label="Código y resumen">
          <MasterCodePreview groupCode={groupCode} subgroupCode={subgroupCode} />
          <div>
            <HelpFieldInfo
              label="Código Master"
              what="Identifica de forma única el artículo homologado. Se propone desde el grupo y subgrupo que defines y Contabilidad lo confirma."
              origin="Se genera a partir de tu clasificación; no lo inventes manualmente."
              owner="Almacén lo propone, Contabilidad lo valida."
            />
          </div>

          {request.groupId && (
            <div className="card p16">
              <span className="muted small">Código de Origen (Profit)</span>
              <div className="origin-code">
                {request.partNumber || '—'}
              </div>
            </div>
          )}
        </div>
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

      <SectionCard
        title="Clasificación"
            desc={canEditClassification
              ? 'Catálogos directos desde Profit. El subgrupo depende del grupo; categoría y marca son independientes.'
              : 'Clasificación registrada (solo lectura).'}
          >

            {profitError && (
              <Alert tone="danger">
                No se pudieron cargar los catálogos de Profit: {profitError}
              </Alert>
            )}

            {canEditClassification && (
              <Alert tone="info">
                El cambio de clasificación modifica el código propuesto.
              </Alert>
            )}

            <div className="form-grid">
              <Field label="Tipo de artículo (Profit)" required>
                <Select value={articleType} onChange={e => handleTypeChange(e.target.value.trim())} disabled={!canEditClassification}>
                  <option value="">Seleccionar tipo</option>
                  {pTipos.map(t => (
                    <option key={t.code.trim()} value={t.code.trim()}>{t.code.trim()} — {t.label}</option>
                  ))}
                </Select>
                {groupDefaultType && !articleTypeManual && articleType && (
                  <span className="muted small field-note">Sugerido por la línea {groupCode}.</span>
                )}
                {articleTypeManual && (
                  <span className="muted small field-note">El tipo fue seleccionado manualmente.</span>
                )}
              </Field>

              <Field label="Grupo (Profit)" required>
                <Select value={groupCode} onChange={e => handleGroupChange(e.target.value.trim())} disabled={!canEditClassification}>
                  <option value="">Seleccionar grupo</option>
                  {pGrupos.map(g => <option key={g.co_lin.trim()} value={g.co_lin.trim()}>{g.co_lin.trim()} — {g.lin_des.trim()}</option>)}
                </Select>
                <HelpFieldInfo
                  label="Grupo (Profit)"
                  what="Define la clasificación principal del artículo dentro del catálogo de Profit. El subgrupo disponible depende del grupo que elijas."
                  origin="Catálogo de líneas de Profit."
                  owner="Almacén."
                />
              </Field>

              <Field label="Subgrupo (del grupo seleccionado)" required>
                <Select value={subgroupCode} onChange={e => setSubgroupCode(e.target.value.trim())} disabled={!groupCode || !canEditClassification}>
                  <option value="">Seleccionar subgrupo</option>
                  {filteredSubgroups.map(s => <option key={`${s.co_lin.trim()}/${s.co_subl.trim()}`} value={s.co_subl.trim()}>{s.co_subl.trim()} — {s.subl_des.trim()}</option>)}
                </Select>
              </Field>

              <label>
                <span className="muted small">Categoría (Profit, independiente — 01 = NO APLICA)</span>
                <Select
                  value={categoryCode}
                  disabled={!canEditClassification}
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
                  disabled={!canEditClassification}
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
                  <span className="muted small field-note">Marca guardada: {brandName} (catálogo anterior)</span>
                )}
              </label>

              <Field label="Unidad de venta (Profit)" required>
                <Select value={unitCode} onChange={e => setUnitCode(e.target.value.trim())} disabled={!canEditClassification}>
                  <option value="">Seleccionar unidad</option>
                  {pUnidades.map(u => <option key={u.co_uni.trim()} value={u.co_uni.trim()}>{u.co_uni.trim()} — {u.des_uni.trim()}</option>)}
                </Select>
              </Field>

              <Field label="Impuesto (tipo_imp Profit)">
                <Select
                  value={effectiveTax}
                  disabled={!canEditClassification}
                  onChange={e => { setTaxType(e.target.value.trim()); setTaxTouched(true); }}
                >
                  <option value="">Derivar por regla</option>
                  {pTasas.map(t => <option key={t.tipo.trim()} value={t.tipo.trim()}>{t.tipo.trim()} — {t.descripcio}</option>)}
                </Select>
                {taxWarning && (
                  <span className="muted small field-note">{taxWarning}</span>
                )}
                {!taxWarning && derivedTax && (
                  <span className="muted small field-note">Valor que utilizará Profit: tasa {effectiveTax}.</span>
                )}
              </Field>

              <label>
                <span className="muted small">Part Number</span>
                <input className="input" value={partNumber} onChange={e => setPartNumber(e.target.value)} placeholder="Part Number" disabled={!canEditClassification} />
              </label>
            </div>

            <label className="field-block">
              <span className="muted small">Aplicación</span>
              <input className="input" value={application} onChange={e => setApplication(e.target.value)} placeholder="Aplicación del artículo" disabled={!canEditClassification} />
            </label>
          </SectionCard>

          {canEditClassification && (
            <div className="action-bar">
              <Can permission="WAREHOUSE.CLASSIFY">
                <Button variant="ghost" onClick={() => setReturnModal(true)} disabled={saving}>Devolver</Button>
                <Button variant="secondary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : saved ? 'Guardar Borrador ✓' : 'Guardar Borrador'}</Button>
                <Button variant="secondary" onClick={handleValidate} disabled={validating || saving}>{validating ? 'Validando...' : 'Validar artículo'}</Button>
                <Button onClick={() => setConfirmApprove(true)} disabled={saving || !canApprove}>{saving ? 'Procesando...' : 'Aprobar Clasificación'}</Button>
              </Can>
            </div>
          )}
          {canEditClassification && !canApprove && (
            <p className="muted small block-mt-sm">
              Para aprobar se requieren grupo, subgrupo, tipo de artículo y unidad Profit.
            </p>
          )}

          {/* Datos listos para Profit (§23): solo lectura, sin botón de escritura. */}
          <SectionCard
            title="Datos listos para Profit"
            desc="Verificación previa a la futura escritura. No escribe en Profit."
          >
            {!dryRun ? (
              <p className="muted small">
                {canEditClassification
                  ? 'Pulse «Validar artículo» para ejecutar la validación completa.'
                  : 'Validación informativa: la clasificación ya fue enviada al Encargado de Almacén.'}
              </p>
            ) : (
              <div className="stack-sm">
                <p className={`dryrun-verdict ${dryRun.ready ? 'dryrun-ready' : 'dryrun-notready'}`}>
                  {dryRun.ready ? 'ARTÍCULO LISTO' : 'ARTÍCULO NO LISTO'}
                </p>
                {dryRun.checks.map(c => (
                  <div key={c.key} className="dryrun-check">
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
          </SectionCard>

          <ConfirmDialog
            open={confirmApprove}
            title="Aprobar clasificación"
            desc="¿Aprobar esta clasificación? La solicitud pasará a aprobación del Encargado de Almacén."
            confirmLabel="Aprobar y enviar"
            busy={saving}
            onCancel={() => setConfirmApprove(false)}
            onConfirm={() => { setConfirmApprove(false); void handleApprove(); }}
          />

          {error && (
            <Alert tone="danger">{error}</Alert>
          )}

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
          ✓ Borrador guardado correctamente. La solicitud continúa pendiente en Almacén.
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
