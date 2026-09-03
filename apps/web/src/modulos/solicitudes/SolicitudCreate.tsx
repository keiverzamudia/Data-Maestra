import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../contextos/SessionContext';
import { requestService } from '../../servicios';
import { PageHeader, Button, Input, Textarea, Select, Modal } from '../../componentes/ui';
import { WorkflowTimeline } from '../../componentes/workflow';
import { compressImage, formatFileSize, validateImageFile, type CompressResult } from '../../utilidades/image';

export const RequestCreate: React.FC = () => {
  const { session } = useSession();
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
  const dropRef = React.useRef<HTMLDivElement>(null);

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
    try {
      const req = await requestService.create({
        companyId: session.company.id,
        departmentId: session.department.id,
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
      <div className="stack">
        <PageHeader title="Solicitud Creada" />
        <div className="card p16" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h2>Solicitud creada correctamente</h2>
          <p className="muted" style={{ marginTop: 8 }}>N° {created.number}</p>
          <p className="muted">Estado: <strong>Enviada a Gerente</strong></p>
          <p className="muted">Fecha: {new Date().toLocaleDateString('es-VE')}</p>
          <div style={{ marginTop: 24 }}>
            <Button onClick={() => navigate('/requester')} variant="secondary">Volver a Solicitudes</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" onPaste={handlePaste}>
      <PageHeader title="Nueva Solicitud" subtitle="Solicitud de nuevo artículo" />

      <WorkflowTimeline status="BORRADOR" />

      <div className="grid2">
        <div className="stack">
          <div className="card p16">
            <h3 className="h1" style={{ fontSize: 16 }}>Información Automática</h3>
            <div className="review-grid" style={{ marginTop: 8 }}>
              <div><span className="muted small">Solicitante</span><br /><strong>{session.name}</strong></div>
              <div><span className="muted small">Área</span><br /><strong>{session.department.name}</strong></div>
              <div><span className="muted small">Empresa</span><br /><strong>{session.company.name}</strong></div>
              <div><span className="muted small">Autoriza</span><br /><strong>{session.department.managerName}</strong></div>
            </div>
          </div>

          <div className="card p16">
            <h3 className="h1" style={{ fontSize: 16 }}>Descripción del Artículo</h3>
            <p className="muted small" style={{ marginTop: 4, marginBottom: 8 }}>
              La descripción debe ser lo más específica posible porque será utilizada por el analizador para identificar y clasificar el artículo.
            </p>
            <Textarea
              placeholder="Ejemplo: PARACHOQUE DELANTERO FOTON 45 TON"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          <div className="card p16">
            <h3 className="h1" style={{ fontSize: 16 }}>Foto Referencial del Artículo</h3>
            <p className="muted small" style={{ marginTop: 4, marginBottom: 8 }}>
              Opcional. Adjunte una foto o pegue con Ctrl+V. Formatos: JPG, PNG, WEBP. Máximo 10 MB.
            </p>

            <div
              ref={dropRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              style={{
                border: '2px dashed var(--border)',
                borderRadius: 8,
                padding: imagePreview ? 12 : 24,
                textAlign: 'center',
                minHeight: imagePreview ? 'auto' : 120,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {imagePreview ? (
                <div style={{ width: '100%' }}>
                  <img
                    src={imagePreview}
                    alt="Preview"
                    style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, display: 'block', margin: '0 auto' }}
                  />
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
              <p style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{imageError}</p>
            )}
          </div>

          <div className="card p16">
            <h3 className="h1" style={{ fontSize: 16 }}>Detalles Adicionales</h3>
            <div className="form-grid" style={{ marginTop: 8 }}>
              <label>
                <span className="muted small">Prioridad</span>
                <Select value={priority} onChange={e => setPriority(Number(e.target.value) as 0 | 1 | 2 | 3)}>
                  <option value={0}>Baja</option>
                  <option value={1}>Media</option>
                  <option value={2}>Alta</option>
                  <option value={3}>Crítica</option>
                </Select>
              </label>
              <label>
                <span className="muted small">Propósito</span>
                <Input placeholder="Ejemplo: Mantenimiento preventivo" value={purpose} onChange={e => setPurpose(e.target.value)} />
              </label>
            </div>
          </div>

          <div className="form-actions">
            <Button variant="secondary" onClick={() => navigate('/requester')}>Cancelar</Button>
            <Button onClick={() => setShowSummary(true)} disabled={!description.trim()}>Enviar Solicitud</Button>
          </div>
        </div>
      </div>

      <Modal open={showSummary} onClose={() => setShowSummary(false)} title="Resumen de Solicitud">
        <div className="stack-sm">
          <div className="review-grid">
            <div><span className="muted small">Solicitante</span><br /><strong>{session.name}</strong></div>
            <div><span className="muted small">Área</span><br /><strong>{session.department.name}</strong></div>
            <div><span className="muted small">Autoriza</span><br /><strong>{session.department.managerName}</strong></div>
            <div><span className="muted small">Empresa</span><br /><strong>{session.company.name}</strong></div>
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
            <Button onClick={handleSubmit} disabled={sending}>{sending ? 'Enviando...' : 'Enviar Solicitud'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
