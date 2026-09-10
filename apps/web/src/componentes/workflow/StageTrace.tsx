import * as React from 'react';
import type { ApprovalRef } from '../../tipos';

function lastApprove(approvals: ApprovalRef[] | undefined, toStatus: string): ApprovalRef | undefined {
  const rows = (approvals ?? []).filter(a => a.action === 'APPROVE' && a.toStatus === toStatus);
  return rows[rows.length - 1];
}

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString('es-VE')} · ${d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;
}

interface Props {
  approvals?: ApprovalRef[];
  /** Posiciones contables aprobadas (línea de Contabilidad). */
  accCount?: number;
  /** En Aprobación Final la validación maestra es la etapa actual. */
  validationCurrent?: boolean;
}

/**
 * 12E — Trazabilidad por etapa con el actor REAL del historial (approvals),
 * nunca el usuario conectado. Solo lectura.
 */
export const StageTrace: React.FC<Props> = ({ approvals, accCount, validationCurrent }) => {
  const almacen = lastApprove(approvals, 'PENDIENTE_CONTABILIDAD') ?? lastApprove(approvals, 'ALMACEN_APROBADO');
  const contab = lastApprove(approvals, 'PENDIENTE_VALIDACION_MAESTRA');
  const validacion = lastApprove(approvals, 'APROBADO_FINAL');

  const row = (done: boolean, title: string, by?: string | null, extra?: string | null, date?: string | null) => (
    <div className="trace-row">
      <span aria-hidden="true">{done ? '✓' : '○'}</span>
      <div>
        <div><strong>{title}</strong></div>
        {done && by && <div className="muted small">Por: {by}</div>}
        {done && extra && <div className="muted small">{extra}</div>}
        {done && date && <div className="muted small">{date}</div>}
        {!done && <div className="muted small">Pendiente</div>}
      </div>
    </div>
  );

  return (
    <div className="stack-sm" aria-label="Trazabilidad de aprobaciones">
      {row(!!almacen, 'Almacén aprobado', almacen?.actor?.displayName, undefined, fmtDate(almacen?.createdAt))}
      {row(!!contab, 'Contabilidad validada', contab?.actor?.displayName,
        accCount != null && contab ? `${accCount} posición${accCount === 1 ? '' : 'es'} contable${accCount === 1 ? '' : 's'}` : undefined,
        fmtDate(contab?.createdAt))}
      {validationCurrent && !validacion
        ? row(false, 'Validación Maestra (etapa actual)', undefined, 'Se completa con tu aprobación.')
        : row(!!validacion, 'Validación Maestra completada', validacion?.actor?.displayName, undefined, fmtDate(validacion?.createdAt))}
    </div>
  );
};
