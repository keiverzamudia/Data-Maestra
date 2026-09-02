import * as React from 'react';
import { useCatalogos } from '../../hooks/useCatalogos';

interface MasterCodePreviewProps {
  groupId: string;
  subgroupId: string;
  nextCorrelative?: number;
}

export const MasterCodePreview: React.FC<MasterCodePreviewProps> = ({ groupId, subgroupId, nextCorrelative = 1 }) => {
  const { grupos, subgrupos } = useCatalogos();
  const group = grupos.find(g => g.id === groupId);
  const subgroup = subgrupos.find(s => s.id === subgroupId);

  const code = group && subgroup
    ? `${group.code}${subgroup.code}${String(nextCorrelative).padStart(6, '0')}`
    : '—';

  return (
    <div className="card p16 code-preview-panel">
      <span className="muted small">Código Propuesto</span>
      <div className="master-code-display">{code}</div>
      {group && subgroup && (
        <div className="muted small" style={{ marginTop: 4 }}>
          {group.code} + {subgroup.code} + {String(nextCorrelative).padStart(6, '0')}
        </div>
      )}
    </div>
  );
};
