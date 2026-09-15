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
  /** Código Profit real tras INSERT + VERIFY (16A). */
  profitCode?: string | null;
}

/**
 * 12E/16A — Trazabilidad por etapa con el actor REAL del historial (approvals),
 * nunca el usuario conectado. Solo lectura. Contabilidad es la última
 * aprobación humana; Profit es operación técnica posterior.
 */
export const StageTrace: React.FC<Props> = ({ approvals, accCount, profitCode }) => {
  const almacen = lastApprove(approvals, 'PENDIENTE_CONTABILIDAD');
  const contab = lastApprove(approvals, 'CONTABILIDAD_APROBADA');

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
      {row(!!almacen, 'Aprobación Almacén', almacen?.actor?.displayName, undefined, fmtDate(almacen?.createdAt))}
      {row(!!contab, 'Contabilidad aprobada', contab?.actor?.displayName,
        accCount != null && contab ? `${accCount} posición${accCount === 1 ? '' : 'es'} contable${accCount === 1 ? '' : 's'}` : undefined,
        fmtDate(contab?.createdAt))}
      {row(!!profitCode, 'Registro Profit',
        profitCode ? `Código ${profitCode}` : undefined, undefined, undefined)}
    </div>
  );
};
