import * as React from 'react';
import type { Request } from '../../tipos';
import { useCatalogos } from '../../hooks/useCatalogos';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { WorkflowTimeline } from './WorkflowTimeline';
import { ImageLightbox } from '../ui';

function findName(list: { id: string; name: string }[], id?: string) {
  return list.find(x => x.id === id)?.name || '—';
}

export const RequestDetail: React.FC<{ request: Request; showWorkflow?: boolean }> = ({ request, showWorkflow = true }) => {
  const { grupos, subgrupos, categorias, marcas, unidades } = useCatalogos();
  const { usuarios, departamentos } = useOrganizacion();
  const requester = usuarios.find(u => u.id === request.requesterId);
  const deptFromList = departamentos.find(d => d.id === request.departmentId);
  const embeddedDept = (request as Request & { department?: { managerId?: string | null; name: string } }).department;
  const dept = embeddedDept ?? deptFromList;
  const managerId = (dept as any)?.managerId ?? deptFromList?.managerId;
  const manager = managerId ? usuarios.find(u => u.id === managerId) : null;

  const [lightboxOpen, setLightboxOpen] = React.useState(false);

  return (
    <div className="stack">
      {showWorkflow && <WorkflowTimeline status={request.status} />}

      <div className="card p16">
        <h3 className="h1" style={{ fontSize: 16 }}>Detalle de Solicitud</h3>
        <div className="review-grid" style={{ marginTop: 8 }}>
          <div>
            <span className="muted small">Solicitante</span>
            <br />
            <strong>{requester?.displayName || '—'}</strong>
          </div>
          <div>
            <span className="muted small">Área</span>
            <br />
            <strong>{dept?.name || '—'}</strong>
          </div>
          <div>
            <span className="muted small">Autoriza</span>
            <br />
            <strong>{manager?.displayName || '—'}</strong>
          </div>
          <div>
            <span className="muted small">Descripción</span>
            <br />
            <strong>{request.requestedDescription}</strong>
          </div>
          {request.purpose && (
            <div>
              <span className="muted small">Propósito</span>
              <br />
              <strong>{request.purpose}</strong>
            </div>
          )}
        </div>
      </div>

      {request.referencePhotoUri && (
        <div className="card p16">
          <span className="muted small">Imagen referencial</span>
          <img
            src={`/api/v1/uploads/${request.referencePhotoUri}`}
            alt="Imagen referencial"
            onClick={() => setLightboxOpen(true)}
            style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, marginTop: 8, cursor: 'pointer' }}
          />
          <ImageLightbox
            src={`/api/v1/uploads/${request.referencePhotoUri}`}
            alt="Imagen referencial"
            open={lightboxOpen}
            onClose={() => setLightboxOpen(false)}
            downloadFilename={request.referencePhotoUri.split('/').pop()}
          />
        </div>
      )}

      {(request.groupId || request.subgroupId || request.brandId) && (
        <div className="card p16">
          <h3 className="h1" style={{ fontSize: 16 }}>Clasificación</h3>
          <div className="review-grid" style={{ marginTop: 8 }}>
            <div>
              <span className="muted small">Grupo</span>
              <br />
              <strong>{findName(grupos, request.groupId)}</strong>
            </div>
            <div>
              <span className="muted small">Subgrupo</span>
              <br />
              <strong>{findName(subgrupos, request.subgroupId)}</strong>
            </div>
            <div>
              <span className="muted small">Categoría</span>
              <br />
              <strong>{findName(categorias, request.categoryId)}</strong>
            </div>
            <div>
              <span className="muted small">Marca</span>
              <br />
              <strong>{findName(marcas, request.brandId)}</strong>
            </div>
            <div>
              <span className="muted small">Unidad</span>
              <br />
              <strong>{findName(unidades, request.unitId)}</strong>
            </div>
            {request.manufacturer && (
              <div>
                <span className="muted small">Fabricante</span>
                <br />
                <strong>{request.manufacturer}</strong>
              </div>
            )}
            {request.model && (
              <div>
                <span className="muted small">Modelo</span>
                <br />
                <strong>{request.model}</strong>
              </div>
            )}
            {request.partNumber && (
              <div>
                <span className="muted small">Part Number</span>
                <br />
                <strong>{request.partNumber}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {request.masterCode && (
        <div className="card p16">
          <span className="muted small">Código Master</span>
          <div className="master-code-display" style={{ marginTop: 4 }}>
            {request.masterCode}
          </div>
        </div>
      )}

      {request.accountingCodes && request.accountingCodes.length > 0 && (
        <div className="card p16">
          <span className="muted small">Códigos Contables</span>
          <div style={{ marginTop: 8 }}>
            {request.accountingCodes.map((ac, i) => (
              <div key={i} style={{ marginBottom: 4, fontSize: 13 }}>
                {ac.position && <span className="badge badge-blue" style={{ marginRight: 6 }}>{ac.position}</span>}
                <strong>{ac.code}</strong> — {ac.description}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
