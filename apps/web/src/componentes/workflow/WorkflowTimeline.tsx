import * as React from 'react';
import type { RequestStatus } from '../../tipos';

const stepOrder: { code: RequestStatus; name: string; order: number }[] = [
  { code: 'BORRADOR', name: 'Solicitud', order: 0 },
  { code: 'PENDIENTE_GERENTE', name: 'Gerente', order: 1 },
  { code: 'PENDIENTE_ALMACEN', name: 'Almacén', order: 2 },
  { code: 'PENDIENTE_CONTABILIDAD', name: 'Contabilidad', order: 3 },
  { code: 'PENDIENTE_VALIDACION_MAESTRA', name: 'Validación Maestra', order: 4 },
  { code: 'APROBADO_FINAL', name: 'Aprobación Final', order: 5 },
  { code: 'PROCESANDO_PROFIT', name: 'Registrando en Profit', order: 6 },
  { code: 'REGISTRADO_PROFIT', name: 'Registrado en Profit', order: 7 },
];

function getStepIndex(status: RequestStatus): number {
  const special: Record<string, number> = {
    ALMACEN_APROBADO: 2,
    DEVUELTO: -1, RECHAZADO: -1, ERROR_PROFIT: -2,
  };
  if (special[status] !== undefined) return special[status];
  const idx = stepOrder.findIndex(s => s.code === status);
  return idx >= 0 ? idx : 0;
}

export const WorkflowTimeline: React.FC<{ status: RequestStatus }> = ({ status }) => {
  const currentIdx = getStepIndex(status);
  const isSpecial = ['DEVUELTO', 'RECHAZADO'].includes(status);
  const isProfitError = status === 'ERROR_PROFIT';

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
        <span className={`tl-step ${status === 'DEVUELTO' ? 'tl-current' : ''}`} style={status === 'RECHAZADO' ? { background: '#fee2e2', color: '#991b1b' } : {}}>
          <span className="tl-dot">{status === 'RECHAZADO' ? '✕' : '↩'}</span>
          {status === 'RECHAZADO' ? 'Rechazado' : 'Devuelto'}
        </span>
      )}
      {isProfitError && (
        <span className="tl-step" style={{ background: '#fef3c7', color: '#92400e' }}>
          <span className="tl-dot">⚠</span>
          Error en Profit (técnico, no es rechazo)
        </span>
      )}
    </div>
  );
};
