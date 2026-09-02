import * as React from 'react';
import { apiImportacionService } from '../../servicios/api/api-importacion-service';
import { PageHeader, Button, Badge, KpiCard, StatusBadge, EmptyState } from '../../componentes/ui';
import type { ImportRun } from '../../tipos';

const PipelineStage: React.FC<{
  name: string; status: 'done' | 'warning' | 'processing' | 'pending';
  count?: number; errors?: number; warnings?: number;
}> = ({ name, status, count, errors, warnings }) => {
  const icons = { done: '✓', warning: '⚠', processing: '●', pending: '○' };
  const colors = { done: '#16a34a', warning: '#ca8a04', processing: '#2563eb', pending: '#94a3b8' };
  return (
    <div className="pipeline-stage" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ color: colors[status], fontSize: 18, width: 24, textAlign: 'center' }}>{icons[status]}</span>
      <div style={{ flex: 1 }}>
        <strong>{name}</strong>
        {count !== undefined && <span className="muted small" style={{ marginLeft: 8 }}>{count.toLocaleString()} registros</span>}
      </div>
      {errors !== undefined && errors > 0 && <Badge tone="red">{errors} errores</Badge>}
      {warnings !== undefined && warnings > 0 && <Badge tone="yellow">{warnings} advertencias</Badge>}
    </div>
  );
};

export const ImportsPage: React.FC = () => {
  const [imports, setImports] = React.useState<ImportRun[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiImportacionService.getImportRuns().then(data => {
      setImports(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty">Cargando...</div>;

  const totalRecords = imports.reduce((s, i) => s + i.rowsRead, 0);
  const totalImported = imports.reduce((s, i) => s + i.rowsImported, 0);
  const totalErrors = imports.reduce((s, i) => s + i.rowsFailed, 0);

  return (
    <div className="stack">
      <PageHeader title="Importaciones" subtitle="Pipeline de procesamiento de datos" />

      {/* KPIs */}
      <div className="kpi-grid">
        <KpiCard label="Registros Totales" value={totalRecords.toLocaleString()} />
        <KpiCard label="Importados" value={totalImported.toLocaleString()} tone="text-green" />
        <KpiCard label="Errores" value={totalErrors} tone={totalErrors > 0 ? 'kpi-red' : ''} />
        <KpiCard label="Importaciones" value={imports.length} />
      </div>

      {/* Data Pipeline */}
      <div className="card p16">
        <h3 className="h1" style={{ fontSize: 16 }}>Procesamiento de Datos</h3>
        <div style={{ marginTop: 12 }}>
          <PipelineStage name="1. Importación" status="done" count={totalRecords} />
          <PipelineStage name="2. Sanitización" status="done" count={totalImported} />
          <PipelineStage name="3. Normalización" status="done" count={totalImported} />
          <PipelineStage name="4. Data Quality" status="pending" />
          <PipelineStage name="5. Matching" status="pending" />
          <PipelineStage name="6. Homologación" status="pending" />
        </div>
      </div>

      {/* Import Runs */}
      <div className="card p16">
        <h3 className="h1" style={{ fontSize: 16 }}>Historial de Importaciones</h3>
        {imports.length === 0 ? (
          <EmptyState title="No hay importaciones registradas" desc="Las importaciones aparecerán aquí cuando se procesen datos" />
        ) : (
          <table className="table" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th>Fuente</th>
                <th>Inicio</th>
                <th>Estado</th>
                <th>Leídos</th>
                <th>Importados</th>
                <th>Sin cambios</th>
                <th>Errores</th>
              </tr>
            </thead>
            <tbody>
              {imports.map(imp => (
                <tr key={imp.id}>
                  <td>{imp.sourceName || '—'}</td>
                  <td className="muted small">{new Date(imp.startedAt).toLocaleString('es-VE')}</td>
                  <td><StatusBadge status={imp.status} /></td>
                  <td>{imp.rowsRead.toLocaleString()}</td>
                  <td className="text-green">{imp.rowsImported}</td>
                  <td>{imp.rowsUnchanged.toLocaleString()}</td>
                  <td className={imp.rowsFailed > 0 ? 'text-red' : ''}>{imp.rowsFailed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Data Quality - Pendiente */}
      <div className="card p16">
        <h3 className="h1" style={{ fontSize: 16 }}>Data Quality</h3>
        <EmptyState title="Módulo pendiente de implementación" desc="Data Quality se conectará cuando se implemente el backend de evaluación de calidad" />
      </div>

      {/* Matching - Pendiente */}
      <div className="card p16">
        <h3 className="h1" style={{ fontSize: 16 }}>Matching</h3>
        <EmptyState title="Módulo pendiente de implementación" desc="Matching se conectará cuando se implemente el backend de matching" />
      </div>
    </div>
  );
};
