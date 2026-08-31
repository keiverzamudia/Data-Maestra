import * as React from 'react';
import { mockImportService, mockQualityService, mockMatchingService } from '../../services/mock';
import { sourceItems } from '../../mock/source-items';
import { PageHeader, Button, Badge, KpiCard, StatusBadge, EmptyState } from '../../components/ui';
import type { ImportRun, DataQualityResult, MatchCandidate } from '../../types';

// Pipeline stages
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
  const [quality, setQuality] = React.useState<DataQualityResult[]>([]);
  const [matches, setMatches] = React.useState<MatchCandidate[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      mockImportService.getImportRuns(),
      mockQualityService.list(),
      mockMatchingService.list(),
    ]).then(([imp, qual, match]) => {
      setImports(imp);
      setQuality(qual);
      setMatches(match);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="empty">Cargando...</div>;

  const totalRecords = imports.reduce((s, i) => s + i.rowsRead, 0);
  const totalImported = imports.reduce((s, i) => s + i.rowsImported, 0);
  const totalErrors = imports.reduce((s, i) => s + i.rowsFailed, 0);
  const totalWarnings = quality.reduce((s, q) => s + q.issues.filter(i => i.severity === 'WARNING').length, 0);
  const dqScore = quality.length > 0 ? Math.round(quality.reduce((s, q) => s + q.overallScore, 0) / quality.length) : 0;

  const matchPending = matches.filter(m => m.status === 'PENDING_REVIEW').length;
  const matchHigh = matches.filter(m => m.score >= 90).length;
  const matchMedium = matches.filter(m => m.score >= 70 && m.score < 90).length;
  const matchLow = matches.filter(m => m.score < 70).length;

  return (
    <div className="stack">
      <PageHeader title="Importaciones" subtitle="Pipeline de procesamiento de datos" />

      {/* KPIs */}
      <div className="kpi-grid">
        <KpiCard label="Registros Totales" value={totalRecords.toLocaleString()} />
        <KpiCard label="Importados" value={totalImported.toLocaleString()} tone="text-green" />
        <KpiCard label="Errores" value={totalErrors} tone={totalErrors > 0 ? 'kpi-red' : ''} />
        <KpiCard label="Data Quality Score" value={`${dqScore}%`} tone={dqScore >= 80 ? 'text-green' : 'kpi-yellow'} />
        <KpiCard label="Matches Pendientes" value={matchPending} tone={matchPending > 0 ? 'kpi-yellow' : ''} />
      </div>

      {/* Data Pipeline */}
      <div className="card p16">
        <h3 className="h1" style={{ fontSize: 16 }}>Procesamiento de Datos</h3>
        <div style={{ marginTop: 12 }}>
          <PipelineStage name="1. Importación" status="done" count={totalRecords} />
          <PipelineStage name="2. Sanitización" status="done" count={totalImported} />
          <PipelineStage name="3. Normalización" status="done" count={totalImported} />
          <PipelineStage name="4. Data Quality" status={totalWarnings > 0 ? 'warning' : 'done'} count={quality.length} warnings={totalWarnings} />
          <PipelineStage name="5. Matching" status={matchPending > 0 ? 'processing' : 'done'} count={matches.length} />
          <PipelineStage name="6. Homologación" status="pending" />
        </div>
      </div>

      {/* Import Runs */}
      <div className="card p16">
        <h3 className="h1" style={{ fontSize: 16 }}>Historial de Importaciones</h3>
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
                <td>Profit</td>
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
      </div>

      {/* Data Quality */}
      <div className="card p16">
        <h3 className="h1" style={{ fontSize: 16 }}>Data Quality</h3>
        <div className="kpi-grid" style={{ marginTop: 8 }}>
          <KpiCard label="Score General" value={`${dqScore}%`} />
          <KpiCard label="Registros Evaluados" value={quality.length} />
          <KpiCard label="Buenos" value={quality.filter(q => q.overallScore >= 80).length} tone="text-green" />
          <KpiCard label="Con Problemas" value={quality.filter(q => q.overallScore < 80).length} tone="kpi-yellow" />
        </div>
        {quality.filter(q => q.overallScore < 80).length > 0 && (
          <Button size="sm" style={{ marginTop: 12 }}>
            Revisar {quality.filter(q => q.overallScore < 80).length} casos problemáticos
          </Button>
        )}
      </div>

      {/* Matching */}
      <div className="card p16">
        <h3 className="h1" style={{ fontSize: 16 }}>Matching</h3>
        <div className="kpi-grid" style={{ marginTop: 8 }}>
          <KpiCard label="Procesados" value={matches.length} />
          <KpiCard label="Alta Coincidencia" value={matchHigh} tone="text-green" />
          <KpiCard label="Media Coincidencia" value={matchMedium} tone="kpi-yellow" />
          <KpiCard label="Sin Coincidencia" value={matchLow} tone={matchLow > 0 ? 'kpi-red' : ''} />
          <KpiCard label="Revisión Humana" value={matchPending} tone={matchPending > 0 ? 'kpi-yellow' : ''} />
        </div>
        {matchPending > 0 && (
          <Button size="sm" style={{ marginTop: 12 }} onClick={() => window.location.href = '/imports/matching'}>
            Revisar {matchPending} candidatos
          </Button>
        )}
      </div>
    </div>
  );
};
