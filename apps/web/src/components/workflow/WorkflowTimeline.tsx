import * as React from 'react';
import type { RequestStatus } from '../../types';

const stepOrder: { code: RequestStatus; name: string; order: number }[] = [
  { code: 'DRAFT', name: 'Solicitud', order: 0 },
  { code: 'PENDING_MANAGER', name: 'Gerente', order: 1 },
  { code: 'PENDING_WAREHOUSE', name: 'Almacén', order: 2 },
  { code: 'PENDING_ACCOUNTING', name: 'Contabilidad', order: 3 },
  { code: 'APPROVED', name: 'Aprobado', order: 4 },
  { code: 'MASTER_ACTIVE', name: 'Master', order: 5 },
];

function getStepIndex(status: RequestStatus): number {
  const special: Record<string, number> = {
    MANAGER_APPROVED: 1, WAREHOUSE_APPROVED: 2, ACCOUNTING_APPROVED: 3,
    PENDING_FINAL_REVIEW: 3, RETURNED: -1, REJECTED: -1,
  };
  if (special[status] !== undefined) return special[status];
  const idx = stepOrder.findIndex(s => s.code === status);
  return idx >= 0 ? idx : 0;
}

export const WorkflowTimeline: React.FC<{ status: RequestStatus }> = ({ status }) => {
  const currentIdx = getStepIndex(status);
  const isSpecial = ['RETURNED', 'REJECTED'].includes(status);

  return (
    <div className="timeline">
      {stepOrder.map((step, i) => {
        let cls = 'tl-step';
        if (i < currentIdx) cls += ' tl-done';
        else if (i === currentIdx && !isSpecial) cls += ' tl-current';
        return (
          <span key={step.code} className={cls}>
            <span className="tl-dot">{i < currentIdx ? '✓' : i === currentIdx && !isSpecial ? '●' : '○'}</span>
            {step.name}
          </span>
        );
      })}
      {isSpecial && (
        <span className={`tl-step ${status === 'RETURNED' ? 'tl-current' : ''}`} style={status === 'REJECTED' ? { background: '#fee2e2', color: '#991b1b' } : {}}>
          <span className="tl-dot">{status === 'REJECTED' ? '✕' : '↩'}</span>
          {status === 'REJECTED' ? 'Rechazado' : 'Devuelto'}
        </span>
      )}
    </div>
  );
};
