import * as React from 'react';
import type { Request } from '../../tipos';
import { useCatalogos } from '../../hooks/useCatalogos';
import { useOrganizacion } from '../../hooks/useOrganizacion';
import { apiCatalogEffectiveService } from '../../servicios/api/api-catalog-effective-service';
import { WorkflowTimeline } from './WorkflowTimeline';
import { ImageLightbox } from '../ui';

function findName(list: { id: string; name: string }[], id?: string) {
  return list.find(x => x.id === id)?.name || '—';
}

/** Nombre (código) para grupo/subgrupo del catálogo local. */
function nameWithCode(item: { name: string; code: string } | undefined): string {
  if (!item) return '—';
  const code = (item.code ?? '').trim();
  return code ? `${item.name} (${code})` : item.name;
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
  // Nombres Profit para tipo, unidad e impuesto (una sola ráfaga en paralelo;
  // cada consulta tolera fallo individual). Si un nombre no se resuelve, el
  // campo muestra el código crudo, salvo Impuesto que se oculta.
  const [profitNames, setProfitNames] = React.useState<{ tax: string | null; type: string | null; unit: string | null }>({
    tax: null, type: null, unit: null,
  });
  React.useEffect(() => {
    const wantTax = (request.taxType ?? '').trim();
    const wantType = (request.articleType ?? '').trim();
    const wantUnit = (request.unitCode ?? '').trim();
    if (!wantTax && !wantType && !wantUnit) {
      setProfitNames({ tax: null, type: null, unit: null });
      return;
    }
    let cancelled = false;
    const findNameIn = (
      loader: () => Promise<{ items: Array<{ code?: string; description?: string }> }>,
      code: string,
    ): Promise<string | null> => loader().then(
      env => {
        const found = env.items.find(i => (i.code ?? '').trim() === code);
        const name = (found?.description ?? '').trim();
        return name || null;
      },
      () => null,
    );
    void Promise.all([
      wantTax ? findNameIn(() => apiCatalogEffectiveService.taxTypes(), wantTax) : Promise.resolve(null),
      wantType ? findNameIn(() => apiCatalogEffectiveService.articleTypes(), wantType) : Promise.resolve(null),
      wantUnit ? findNameIn(() => apiCatalogEffectiveService.units(), wantUnit) : Promise.resolve(null),
    ]).then(([tax, type, unit]) => {
      if (!cancelled) setProfitNames({ tax, type, unit });
    });
    return () => { cancelled = true; };
  }, [request.taxType, request.articleType, request.unitCode]);

  return (
    <div className="stack">
      {showWorkflow && <WorkflowTimeline status={request.status} />}

      <div className="card p16">
        <h3 className="card-title">Detalle de Solicitud</h3>
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
          {request.adjustedDescription && request.adjustedDescription.trim()
            && request.adjustedDescription.trim() !== (request.requestedDescription ?? '').trim() && (
            <div>
              <span className="muted small">Descripción ajustada por Almacén</span>
              <br />
              <strong>{request.adjustedDescription}</strong>
              <br />
              <span className="muted small">La descripción original fue modificada durante la clasificación.</span>
            </div>
          )}
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
            className="evidence-thumb evidence-action"
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

      {(request.groupId || request.subgroupId || request.brandId || request.articleType) && (
        <div className="card p16">
          <h3 className="card-title">Clasificación</h3>
          <div className="review-grid" style={{ marginTop: 8 }}>
            {request.articleType && (
              <div>
                <span className="muted small">Tipo (Profit)</span>
                <br />
                <strong>{profitNames.type ? `${profitNames.type} (${request.articleType.trim()})` : request.articleType.trim()}{request.articleTypeManual ? ' (manual)' : ''}</strong>
              </div>
            )}
            <div>
              <span className="muted small">Grupo</span>
              <br />
              <strong>{nameWithCode(grupos.find(g => g.id === request.groupId))}</strong>
            </div>
            <div>
              <span className="muted small">Subgrupo</span>
              <br />
              <strong>{nameWithCode(subgrupos.find(s => s.id === request.subgroupId))}</strong>
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
              <strong>{request.unitCode ? (profitNames.unit ? `${profitNames.unit} (${request.unitCode.trim()})` : request.unitCode.trim()) : findName(unidades, request.unitId)}</strong>
            </div>
            {request.taxType && profitNames.tax && (
              <div>
                <span className="muted small">Impuesto (tipo_imp)</span>
                <br />
                <strong>{profitNames.tax} ({request.taxType.trim()})</strong>
              </div>
            )}
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

      {(request.masterCode || request.profitCode) && (
        <div className="card p16">
          {request.masterCode && (
            <>
              <span className="muted small">Código Master</span>
              <div className="master-code-display" style={{ marginTop: 4 }}>
                {request.masterCode}
              </div>
            </>
          )}
          {request.profitCode && (
            <div style={{ marginTop: 8 }}>
              <span className="muted small">Código Profit</span>
              <div className="master-code-display" style={{ marginTop: 4 }}>
                {request.profitCode}
              </div>
            </div>
          )}
        </div>
      )}

      {request.accountingCodes && request.accountingCodes.length > 0 && (
        <div className="card p16">
          <span className="muted small">Códigos Contables</span>
          <div style={{ marginTop: 8 }}>
            {request.accountingCodes.map((ac, i) => (
              <div key={i} className="acct-line">
                {ac.position && <span className="badge badge-blue acct-pos-badge">{ac.position}</span>}
                <strong className="mono">{ac.code}</strong> — {ac.description}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
