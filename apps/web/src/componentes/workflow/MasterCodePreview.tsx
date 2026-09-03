import * as React from 'react';

interface MasterCodePreviewProps {
  groupCode: string;
  subgroupCode: string;
  nextCorrelative?: number;
}

export const MasterCodePreview: React.FC<MasterCodePreviewProps> = ({ groupCode, subgroupCode, nextCorrelative = 1 }) => {
  const code = groupCode && subgroupCode
    ? `${groupCode}${subgroupCode}${String(nextCorrelative).padStart(6, '0')}`
    : '—';

  return (
    <div className="card p16 code-preview-panel">
      <span className="muted small">Código Propuesto</span>
      <div className="master-code-display">{code}</div>
      {groupCode && subgroupCode && (
        <div className="muted small" style={{ marginTop: 4 }}>
          {groupCode} + {subgroupCode} + {String(nextCorrelative).padStart(6, '0')}
        </div>
      )}
    </div>
  );
};
