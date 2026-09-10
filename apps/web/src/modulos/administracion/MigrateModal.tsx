import * as React from 'react';
import { Button, Alert, Field } from '../../componentes/ui';
import { apiOrganizacionService, type MigrationPreview, type MigrationResult } from '../../servicios/api/api-organizacion-service';
import type { Company, Department } from '../../tipos';

interface Props {
  from: Company;
  empresas: Company[];
  onClose: () => void;
  onDone: () => void;
}

/** 12I — Migrar usuarios entre empresas (transaccional) y retirar la origen. */
export const MigrateModal: React.FC<Props> = ({ from, empresas, onClose, onDone }) => {
  const [toId, setToId] = React.useState('');
  const [preview, setPreview] = React.useState<MigrationPreview | null>(null);
  const [deptosDestino, setDeptosDestino] = React.useState<Department[]>([]);
  const [deptMap, setDeptMap] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<MigrationResult | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  const destinos = empresas.filter(c => c.id !== from.id && c.active);

  const loadPreview = async (destId: string) => {
    if (!destId) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    setConfirming(false);
    try {
      const [pv, dd] = await Promise.all([
        apiOrganizacionService.vistaPreviaMigracion(from.id, destId),
        apiOrganizacionService.getDepartamentos(destId),
      ]);
      setPreview(pv);
      setDeptosDestino(dd.filter(d => d.active));
      const init: Record<string, string> = {};
      for (const d of pv.departments) {
        const same = dd.find(x => x.active && x.code.toUpperCase() === d.code.toUpperCase());
        if (same) init[d.id] = same.id;
      }
      setDeptMap(init);
    } catch (err: any) {
      setError(err?.message || 'No se pudo cargar la vista previa.');
    } finally {
      setLoading(false);
    }
  };

  const unmapped = (preview?.departments ?? []).filter(d => !(d.id in deptMap) || !deptMap[d.id]);

  const run = async () => {
    if (!toId || running) return;
    setRunning(true);
    setError(null);
    try {
      const map: Record<string, string | null> = {};
      for (const d of preview?.departments ?? []) {
        map[d.id] = deptMap[d.id] || null;
      }
      const res = await apiOrganizacionService.migrarEmpresa({ fromCompanyId: from.id, toCompanyId: toId, departmentMap: map });
      setResult(res);
      setConfirming(false);
      onDone();
    } catch (err: any) {
      setError(err?.message || 'No se pudo completar la migración.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="stack-sm">
      {!result ? (
        <>
          <Field label="Empresa destino" required helper="Debe estar activa y ser diferente a la origen.">
            <select
              className="input"
              value={toId}
              onChange={e => { setToId(e.target.value); void loadPreview(e.target.value); }}
              disabled={loading || running}
              aria-label="Empresa destino"
            >
              <option value="">Seleccionar destino...</option>
              {destinos.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
            </select>
          </Field>
          {loading && <span className="muted small">Cargando vista previa…</span>}
          {error && <Alert tone="danger">{error}</Alert>}
          {preview && (
            <div className="stack-sm">
              <div className="summary-strip" aria-label="Resumen de migración">
                <div className="summary-item"><div className="summary-num">{preview.users}</div><div className="summary-label">Usuarios a migrar</div></div>
                <div className="summary-item"><div className="summary-num">{preview.departments.length}</div><div className="summary-label">Departamentos afectados</div></div>
                <div className="summary-item"><div className="summary-num">{preview.historicalRequests}</div><div className="summary-label">Solicitudes históricas</div></div>
              </div>
              <p className="muted small">Las solicitudes históricas no se modifican: conservan la empresa origen.</p>
              {preview.departments.length > 0 && (
                <div className="stack-sm">
                  <strong className="small">Equivalencias de departamento</strong>
                  {preview.departments.map(d => (
                    <Field key={d.id} label={`${d.name} (${d.code}) — ${d.memberships} asignación${d.memberships === 1 ? '' : 'es'}`}>
                      <select
                        className="input"
                        value={deptMap[d.id] ?? ''}
                        onChange={e => setDeptMap(prev => ({ ...prev, [d.id]: e.target.value }))}
                        disabled={running}
                        aria-label={`Equivalencia para ${d.name}`}
                      >
                        <option value="">Sin departamento</option>
                        {deptosDestino.map(x => <option key={x.id} value={x.id}>{x.name} ({x.code})</option>)}
                      </select>
                    </Field>
                  ))}
                  {unmapped.length > 0 && (
                    <Alert tone="warning">{unmapped.length} departamento{unmapped.length === 1 ? '' : 's'} quedará{unmapped.length === 1 ? '' : 'n'} "Sin departamento". Puede asignar equivalencias arriba.</Alert>
                  )}
                </div>
              )}
              {!confirming ? (
                <Button onClick={() => setConfirming(true)} disabled={running || preview.users === 0 && preview.departments.length === 0}>
                  Revisar y confirmar
                </Button>
              ) : (
                <div className="card p16">
                  <strong>Confirmar migración</strong>
                  <div className="review-grid" style={{ marginTop: 8 }}>
                    <div><span className="muted small">Origen</span><br /><strong>{preview.from.name}</strong></div>
                    <div><span className="muted small">Destino</span><br /><strong>{preview.to.name}</strong></div>
                    <div><span className="muted small">Usuarios</span><br /><strong>{preview.users}</strong></div>
                    <div><span className="muted small">Solicitudes históricas</span><br /><strong>{preview.historicalRequests} (no se modifican)</strong></div>
                  </div>
                  <p className="muted small" style={{ marginTop: 8 }}>
                    Los usuarios cambiarán de empresa, pero conservarán su identidad, roles, permisos e historial.
                    La empresa origen quedará retirada (inactiva). Esta operación es todo o nada.
                  </p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <Button onClick={run} disabled={running}>{running ? 'Migrando…' : 'Migrar y retirar empresa'}</Button>
                    <Button variant="secondary" onClick={() => setConfirming(false)} disabled={running}>Volver</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="stack-sm">
          <Alert tone="success">
            Migración completada — {result.users} usuarios, {result.moved} membresías movidas
            {result.deduplicated > 0 ? `, ${result.deduplicated} ya existían en destino` : ''}.
            La empresa origen quedó retirada.
          </Alert>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      )}
    </div>
  );
};
