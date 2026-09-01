import * as React from 'react';
import type { Request } from '../../types';
import { groups, subgroups, categories, brands, units } from '../../mock/catalog';
import { users, departments } from '../../mock/companies';
import { WorkflowTimeline } from './WorkflowTimeline';
import { ImageLightbox } from '../ui';

function findName(list: { id: string; name: string }[], id?: string) {
  return list.find(x => x.id === id)?.name || '—';
}

export const RequestDetail: React.FC<{ request: Request; showWorkflow?: boolean }> = ({ request, showWorkflow = true }) => {
  const requester = users.find(u => u.id === request.requesterId);
  const dept = departments.find(d => d.id === request.departmentId);
  const manager = dept?.managerId ? users.find(u => u.id === dept.managerId) : null;
  const [lightboxOpen, setLightboxOpen] = React.useState(false);

  return (
    <div className="stack">
      {showWorkflow && <WorkflowTimeline status={request.status} />}

      <div className="card p16">
        <h3 className="h1" style={{ fontSize: 16 }}>Información del Solicitante</h3>
        <div className="review-grid" style={{ marginTop: 8 }}>
          <div><span className="muted small">Nombre</span><br /><strong>{requester?.displayName || '—'}</strong></div>
          <div><span className="muted small">Área</span><br /><strong>{dept?.name || '—'}</strong></div>
          <div><span className="muted small">Autoriza</span><br /><strong>{manager?.displayName || '—'}</strong></div>
          <div><span className="muted small">Fecha</span><br /><strong>{new Date(request.createdAt).toLocaleDateString('es-VE')}</strong></div>
        </div>
      </div>

      <div className="card p16">
        <h3 className="h1" style={{ fontSize: 16 }}>Descripción del Artículo</h3>
        <p style={{ marginTop: 8 }}>{request.requestedDescription}</p>
        {request.purpose && <p className="muted" style={{ marginTop: 4 }}>Propósito: {request.purpose}</p>}
        {request.referencePhotoUri && (
          <div style={{ marginTop: 8 }}>
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

      {(request.groupId || request.subgroupId) && (
        <div className="card p16">
          <h3 className="h1" style={{ fontSize: 16 }}>Clasificación</h3>
          <div className="review-grid" style={{ marginTop: 8 }}>
            <div><span className="muted small">Grupo</span><br /><strong>{findName(groups, request.groupId)}</strong></div>
            <div><span className="muted small">Subgrupo</span><br /><strong>{findName(subgroups, request.subgroupId)}</strong></div>
            <div><span className="muted small">Categoría</span><br /><strong>{findName(categories, request.categoryId)}</strong></div>
            <div><span className="muted small">Marca</span><br /><strong>{findName(brands, request.brandId)}</strong></div>
            <div><span className="muted small">Unidad</span><br /><strong>{findName(units, request.unitId)}</strong></div>
            {request.partNumber && <div><span className="muted small">Part Number</span><br /><strong>{request.partNumber}</strong></div>}
            {request.manufacturer && <div><span className="muted small">Fabricante</span><br /><strong>{request.manufacturer}</strong></div>}
          </div>
        </div>
      )}

      {request.notes && (
        <div className="alert">📋 {request.notes}</div>
      )}

      <div className="meta-row">
        <span>Creado: {new Date(request.createdAt).toLocaleString('es-VE')}</span>
        <span>Actualizado: {new Date(request.updatedAt).toLocaleString('es-VE')}</span>
        <span>N° {request.requestNumber}</span>
      </div>

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
