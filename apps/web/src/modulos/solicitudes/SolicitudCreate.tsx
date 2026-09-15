import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { requestService } from '../../servicios';
import { Page, Button, Input, Textarea, Select, Modal, Alert, SectionCard, Field } from '../../componentes/ui';
import { HelpButton } from '../../componentes/ayuda';
import { WorkflowTimeline } from '../../componentes/workflow';
import { compressImage, formatFileSize, validateImageFile, type CompressResult } from '../../utilidades/image';

export const RequestCreate: React.FC = () => {
  // 10E §5: identidad real (user) + contexto organizacional real.
  // Empresa: selector CompanyContext. Departamento: membresías reales del
  // usuario en esa empresa; selector explícito solo si hay varias opciones.
  // Nunca primer-registro ni valores arbitrarios.
  const { user, memberships } = useSession();
  const { companyId, empresas } = useCompany();
  const { departamentos, usuarios } = useOrganizacion(companyId);
  const navigate = useNavigate();
  const [description, setDescription] = React.useState('');
  const [purpose, setPurpose] = React.useState('');
  const [priority, setPriority] = React.useState<0 | 1 | 2 | 3>(0);
  const [showSummary, setShowSummary] = React.useState(false);
  const [created, setCreated] = React.useState<{ id: string; number: number } | null>(null);
  const [sending, setSending] = React.useState(false);

  const [imagePreview, setImagePreview] = React.useState<string | null>(null);
  const [imageFile, setImageFile] = React.useState<File | null>(null);
  const [imageError, setImageError] = React.useState<string | null>(null);
  const [compressInfo, setCompressInfo] = React.useState<CompressResult | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [departmentId, setDepartmentId] = React.useState('');
  const dropRef = React.useRef<HTMLDivElement>(null);

  // Departamentos reales del usuario en la empresa seleccionada.
  const myDepartments = React.useMemo(() => {
    const ids = new Set(
      memberships.filter(m => m.companyId === companyId && m.departmentId).map(m => m.departmentId as string),
    );
    return departamentos.filter(d => ids.has(d.id));
  }, [memberships, companyId, departamentos]);

  // Una sola opción → se usa directamente. Varias → el usuario elige.
  // Cero → bloqueado hasta asignación administrativa (10H).
  React.useEffect(() => {
    if (myDepartments.length === 1) setDepartmentId(myDepartments[0]!.id);
    else setDepartmentId('');
  }, [myDepartments]);

  const selectedDept = departamentos.find(d => d.id === departmentId);
  const companyName = empresas.find(c => c.id === companyId)?.name ?? '—';
  const managerName = selectedDept?.managerId
    ? usuarios.find(u => u.id === selectedDept.managerId)?.displayName ?? '—'
    : '—';

  const processFile = React.useCallback(async (file: File) => {
    setImageError(null);
    setCompressInfo(null);

    const error = validateImageFile(file);
    if (error) {
      setImageError(error);
      return;
    }

    try {
      const result = await compressImage(file);
      setImageFile(result.file);
      setImagePreview(URL.createObjectURL(result.file));
      setCompressInfo(result);
    } catch {
      setImageError('Error al procesar la imagen.');
    }
  }, []);

  const handleFileInput = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handlePaste = React.useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          processFile(file);
          return;
        }
      }
    }
  }, [processFile]);

  const handleDrop = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const removeImage = React.useCallback(() => {
    setImagePreview(null);
    setImageFile(null);
    setImageError(null);
    setCompressInfo(null);
  }, []);

  React.useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            processFile(file);
            return;
          }
        }
      }
    };
    el.addEventListener('paste', handler as any);
    return () => el.removeEventListener('paste', handler as any);
  }, [processFile]);

  const handleSubmit = async () => {
    setSending(true);
    setSubmitError(null);
    try {
      if (!companyId || !departmentId) {
        setSubmitError('Sin contexto organizacional asignado. Solicite a administración su empresa y departamento.');
        setSending(false);
        return;
      }
      const req = await requestService.create({
        companyId,
        departmentId,
        requestedDescription: description,
        purpose,
        priority,
      });

      await requestService.submit(req.id);

      if (imageFile) {
        const formData = new FormData();
        formData.append('photo', imageFile);
        try {
          await fetch(`/api/v1/requests/${req.id}/photo`, {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });
        } catch {
          // Image upload failed but request was created
        }
      }

      setCreated({ id: req.id, number: req.requestNumber });
    } finally {
      setSending(false);
      setShowSummary(false);
    }
  };

  if (created) {
    return (
      <Page title="Solicitud Creada" actions={<HelpButton helpKey="solicitud-create" />}>
        <div className="card p16 success-hero">
          <div className="success-hero-mark" aria-hidden="true">✓</div>
          <h2>Solicitud creada correctamente</h2>
          <p className="muted" style={{ marginTop: 8 }}>N° {created.number}</p>
          <p className="muted">Estado: <strong>Enviada a Gerente</strong></p>
          <p className="muted">Fecha: {new Date().toLocaleDateString('es-VE')}</p>
          <div style={{ marginTop: 24, display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Button onClick={() => navigate(`/requester/${created.id}`)}>Ver solicitud</Button>
            <Button onClick={() => navigate('/solicitudes')} variant="secondary">Mis solicitudes</Button>
          </div>
        </div>
      </Page>
    );
  }

  const descLen = description.trim().length;
  const readyChecks = [
    { label: 'Descripción de al menos 3 caracteres', ok: descLen >= 3 },
    { label: 'Departamento asignado', ok: !!departmentId },
    { label: 'Propósito indicado', ok: purpose.trim().length > 0 },
  ];
  const readyCount = readyChecks.filter(c => c.ok).length;

  return (
    <Page title="Nueva Solicitud" desc="Solicitud de nuevo artículo" actions={<HelpButton helpKey="solicitud-create" />}>
      <div className="stack" onPaste={handlePaste}>
      <WorkflowTimeline status="BORRADOR" />

      <div className="grid-main-side">
        <div className="stack">
          <SectionCard title="Descripción del Artículo" desc="Debe ser lo más específica posible: la usará el analizador para identificar y clasificar el artículo.">
            <Field label="Descripción" required error={description && descLen < 3 ? 'Mínimo 3 caracteres.' : undefined}>
              <Textarea
                placeholder="Ejemplo: PARACHOQUE DELANTERO FOTON 45 TON"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                aria-describedby="desc-counter"
              />
            </Field>
            <p id="desc-counter" className="muted small" style={{ marginTop: 4 }}>{descLen} caracteres (mínimo 3)</p>
          </SectionCard>

          <SectionCard title="Foto Referencial del Artículo" desc="Opcional. Adjunte una foto o pegue con Ctrl+V. Formatos: JPG, PNG, WEBP. Máximo 10 MB.">
            <div
              ref={dropRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className={`dropzone${imagePreview ? ' dropzone-filled' : ''}`}
            >
              {imagePreview ? (
                <div style={{ width: '100%' }}>
                  <img src={imagePreview} alt="Vista previa" className="dropzone-preview" />
                  {compressInfo && (
                    <p className="muted small" style={{ marginTop: 8 }}>
                      Original: {formatFileSize(compressInfo.originalSize)} → Comprimida: {formatFileSize(compressInfo.compressedSize)}
                    </p>
                  )}
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <Button variant="ghost" size="sm" onClick={removeImage}>Eliminar</Button>
                    <label style={{ cursor: 'pointer' }}>
                      <span className="btn btn-ghost btn-sm">Cambiar</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileInput} style={{ display: 'none' }} />
                    </label>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="muted">Arrastre una imagen, haga clic para seleccionar o pegue con Ctrl+V</p>
                  <label style={{ cursor: 'pointer', display: 'inline-block', marginTop: 8 }}>
                    <span className="btn btn-secondary btn-sm">Seleccionar imagen</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileInput} style={{ display: 'none' }} />
                  </label>
                </div>
              )}
            </div>
            {imageError && (
              <p className="field-error" style={{ marginTop: 8 }}>{imageError}</p>
            )}
          </SectionCard>

          <SectionCard title="Detalles Adicionales">
            <div className="form-grid">
              <Field label="Prioridad">
                <Select value={priority} onChange={e => setPriority(Number(e.target.value) as 0 | 1 | 2 | 3)}>
                  <option value={0}>Baja</option>
                  <option value={1}>Media</option>
                  <option value={2}>Alta</option>
                  <option value={3}>Crítica</option>
                </Select>
              </Field>
              <Field label="Propósito" helper="¿Para qué se necesita el artículo?">
                <Input placeholder="Ejemplo: Mantenimiento preventivo" value={purpose} onChange={e => setPurpose(e.target.value)} />
              </Field>
            </div>
          </SectionCard>

          <div className="form-actions">
            <Button variant="secondary" onClick={() => navigate('/requester')}>Cancelar</Button>
            <Button onClick={() => setShowSummary(true)} disabled={!description.trim()}>Enviar Solicitud</Button>
          </div>
        </div>

        <aside className="stack" aria-label="Contexto de la solicitud">
          <SectionCard title="Solicitante">
            <div className="review-grid">
              <div><span className="muted small">Solicitante</span><br /><strong>{user?.displayName ?? '—'}</strong></div>
              <div>
                <span className="muted small">Área</span><br />
                {myDepartments.length > 1 ? (
                  <Select value={departmentId} onChange={e => setDepartmentId(e.target.value)} aria-label="Área">
                    <option value="">Seleccionar área</option>
                    {myDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                ) : (
                  <strong>{selectedDept?.name ?? 'Sin área asignada'}</strong>
                )}
              </div>
              <div><span className="muted small">Empresa</span><br /><strong>{companyName}</strong></div>
              <div><span className="muted small">Autoriza</span><br /><strong>{managerName}</strong></div>
            </div>
            {myDepartments.length === 0 && (
              <Alert tone="danger">
                Sin departamento asignado en esta empresa. Solicite a administración su asignación.
              </Alert>
            )}
          </SectionCard>

          <SectionCard title="Criterios de pre-envío" desc={`${readyCount} de ${readyChecks.length} listos`}>
            <div className="checklist checklist-single">
              {readyChecks.map(c => (
                <div key={c.label} className={`check ${c.ok ? 'check-ok' : 'check-missing'}`}>
                  <span className="check-mark" aria-hidden="true">{c.ok ? '✓' : '✗'}</span>
                  <span className="check-label">{c.label}</span>
                  <span className="check-state">{c.ok ? 'LISTO' : 'FALTA'}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </aside>
      </div>

      <Modal open={showSummary} onClose={() => setShowSummary(false)} title="Resumen de Solicitud">
        <div className="stack-sm">
          <div className="review-grid">
            <div><span className="muted small">Solicitante</span><br /><strong>{user?.displayName ?? '—'}</strong></div>
            <div><span className="muted small">Área</span><br /><strong>{selectedDept?.name ?? '—'}</strong></div>
            <div><span className="muted small">Autoriza</span><br /><strong>{managerName}</strong></div>
            <div><span className="muted small">Empresa</span><br /><strong>{companyName}</strong></div>
          </div>
          <hr />
          <div><span className="muted small">Descripción</span><br /><strong>{description}</strong></div>
          {purpose && <div><span className="muted small">Propósito</span><br />{purpose}</div>}
          {imagePreview && (
            <div>
              <span className="muted small">Foto referencial</span>
              <img src={imagePreview} alt="Preview" style={{ maxWidth: '100%', maxHeight: 150, borderRadius: 8, marginTop: 4 }} />
            </div>
          )}
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setShowSummary(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={sending || !departmentId}>{sending ? 'Enviando...' : 'Enviar Solicitud'}</Button>
          </div>
          {submitError && (
            <Alert tone="danger">{submitError}</Alert>
          )}
        </div>
      </Modal>
      </div>
    </Page>
  );
};
