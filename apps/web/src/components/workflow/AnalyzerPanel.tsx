import * as React from 'react';
import { groups, subgroups } from '../../mock/catalog';

interface AnalyzerPanelProps {
  groupCode?: string;
  subgroupCode?: string;
  brand?: string;
  application?: string;
  confidence: number;
  evidence: string[];
}

export const AnalyzerPanel: React.FC<AnalyzerPanelProps> = ({ groupCode, subgroupCode, brand, application, confidence, evidence }) => {
  const group = groups.find(g => g.code === groupCode);
  const subgroup = subgroups.find(s => s.code === subgroupCode);

  return (
    <div className="card p16 analyzer-panel">
      <div className="flex-between">
        <h3 className="h1" style={{ fontSize: 16 }}>Análisis Automático</h3>
        <span className="badge badge-green">✓ Analizado</span>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="flex gap" style={{ marginBottom: 8 }}>
          <span className="muted small">Confianza:</span>
          <strong className={confidence >= 80 ? 'text-green' : confidence >= 60 ? 'text-yellow' : 'text-red'}>
            {confidence}%
          </strong>
        </div>

        <div className="review-grid">
          <div>
            <span className="muted small">Grupo</span>
            <br />
            <strong>{group ? `${group.code} — ${group.name}` : groupCode || '—'}</strong>
          </div>
          <div>
            <span className="muted small">Subgrupo</span>
            <br />
            <strong>{subgroup ? `${subgroup.code} — ${subgroup.name}` : subgroupCode || '—'}</strong>
          </div>
          {brand && (
            <div>
              <span className="muted small">Marca</span>
              <br />
              <strong>{brand}</strong>
            </div>
          )}
          {application && (
            <div>
              <span className="muted small">Aplicación</span>
              <br />
              <strong>{application}</strong>
            </div>
          )}
        </div>

        {evidence.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <span className="muted small">Evidencia</span>
            <ul className="list">
              {evidence.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
