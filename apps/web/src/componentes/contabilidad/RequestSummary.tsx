import * as React from 'react';
import { ImageLightbox, Alert } from '../ui';
import { StageTrace } from '../workflow';
import { copyText } from '../../utilidades/copy';
import type { ApprovalRef } from '../../tipos';

interface Props {
  masterCode: string;
  description: string;
  requester: string;
  department: string;
  group: string;
  subgroup: string;
  category: string;
  brand: string;
  unit?: string;
  partNumber?: string;
  approvals?: ApprovalRef[];
  photoUri?: string;
  onOpenPhoto: () => void;
  lightboxOpen: boolean;
  onClosePhoto: () => void;
}

/**
 * 12G — Resumen del artículo (ref. Stitch): master destacado + trazabilidad
 * de Almacén con actor real + mini-tiles + miniatura secundaria.
 */
export const RequestSummary: React.FC<Props> = (p) => {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    if (await copyText(p.masterCode)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  const tile = (label: string, value: string, strong = false) => (
    <div className="meta-tile">
      <span className="meta-label">{label}</span>
      <span className="meta-value" style={strong ? undefined : { fontWeight: 600 }}>{value}</span>
    </div>
  );
  return (
    <section className="card p16" aria-label="Resumen del artículo">
      <div className="master-strip">
        <div>
          <span className="meta-label">Código Master Propuesto</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span className="master-code">{p.masterCode}</span>
            <button type="button" className="btn btn-ghost btn-sm copy-btn" onClick={() => void copy()} aria-label="Copiar código master">
              ⧉ {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
        </div>
        <StageTrace approvals={p.approvals} />
      </div>
      <div className="thumb-row" style={{ marginTop: 12 }}>
        {p.photoUri && (
          <div>
            <img src={`/api/v1/uploads/${p.photoUri}`} alt="Imagen referencial" className="acct-thumb" onClick={p.onOpenPhoto} />
            <div className="muted small" style={{ marginTop: 4 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={p.onOpenPhoto}>Ver imagen</button>
            </div>
            <ImageLightbox src={`/api/v1/uploads/${p.photoUri}`} alt="Imagen referencial" open={p.lightboxOpen} onClose={p.onClosePhoto} downloadFilename={p.photoUri.split('/').pop()} />
          </div>
        )}
        <div className="meta-tiles" style={{ flex: 1 }}>
          {tile('Descripción', p.description, true)}
          {tile('Solicitante', p.requester)}
          {tile('Área / Departamento', p.department)}
          {tile('Grupo', p.group)}
          {tile('Subgrupo', p.subgroup)}
          {tile('Categoría', p.category)}
          {tile('Marca', p.brand)}
          {p.unit && tile('Unidad', p.unit)}
          {p.partNumber && tile('Part Number', p.partNumber)}
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <Alert tone="warning">
          <strong>Modo solo lectura:</strong> la clasificación fue aprobada por Almacén. Contabilidad valida
          únicamente las cuentas y asignaciones de posiciones contables asociadas.
        </Alert>
      </div>
    </section>
  );
};
