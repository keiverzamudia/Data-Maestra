import * as React from 'react';
import type { RequestStatus } from '../../tipos';

/**
 * 11B — Stepper visual reutilizable del workflow. Solo representa estados
 * existentes del backend; no cambia el workflow. Etiquetas humanas, responsive
 * (horizontal con scroll en desktop, compacto en móvil) y accesible.
 * 16A — Contabilidad es la última aprobación humana; Profit es operación técnica.
 */

interface StepDef {
  code: string;
  label: string;
}

const MAIN_FLOW: StepDef[] = [
  { code: 'BORRADOR', label: 'Solicitud' },
  { code: 'PENDIENTE_GERENTE', label: 'Gerente' },
  { code: 'PENDIENTE_ALMACEN', label: 'Almacén' },
  // 15A — etapa real del Encargado de Almacén (revisa lo clasificado).
  { code: 'ALMACEN_APROBADO', label: 'Aprobación Almacén' },
  { code: 'PENDIENTE_CONTABILIDAD', label: 'Contabilidad' },
  { code: 'CONTABILIDAD_APROBADA', label: 'Registro Profit' },
  { code: 'INSERTADO_PROFIT', label: 'Registrado Profit' },
];

const STATUS_INFO: Record<string, { title: string; desc: string }> = {
  BORRADOR: { title: 'Solicitud creada', desc: 'La solicitud está en borrador y aún no fue enviada.' },
  PENDIENTE_GERENTE: { title: 'Pendiente de Gerente', desc: 'Esta solicitud requiere aprobación de la gerencia del área.' },
  PENDIENTE_ALMACEN: { title: 'Pendiente de Almacén', desc: 'Esta solicitud requiere clasificación por el área de Almacén.' },
  ALMACEN_APROBADO: { title: 'Aprobación Almacén', desc: 'Almacén completó la clasificación. Está pendiente de aprobación del Encargado de Almacén antes de Contabilidad.' },
  PENDIENTE_CONTABILIDAD: { title: 'Pendiente de Contabilidad', desc: 'Esta solicitud requiere la aprobación contable (última aprobación humana).' },
  CONTABILIDAD_APROBADA: { title: 'Contabilidad aprobada', desc: 'Contabilidad validó los datos. Continúa con el registro en Profit.' },
  PROCESANDO_PROFIT: { title: 'Registrando en Profit', desc: 'La solicitud fue aprobada y está siendo procesada técnicamente.' },
  INSERTADO_PROFIT: { title: 'Registrado en Profit', desc: 'La solicitud fue registrada correctamente en Profit.' },
  ERROR_PROFIT: { title: 'Error de registro en Profit', desc: 'Ocurrió un error técnico al registrar en Profit. No es un rechazo.' },
  DEVUELTO: { title: 'Devuelta', desc: 'La solicitud fue devuelta para corrección.' },
  RECHAZADO: { title: 'Rechazada', desc: 'La solicitud fue rechazada.' },
};

function stepIndex(status: RequestStatus): number {
  const special: Record<string, number> = {
    DEVUELTO: -1, RECHAZADO: -1, ERROR_PROFIT: -2,
    // 16A — operación técnica posterior a la aprobación: mismo paso que Registro Profit.
    PROCESANDO_PROFIT: 5,
  };
  if (special[status] !== undefined) return special[status];
  const direct = MAIN_FLOW.findIndex(s => s.code === status);
  if (direct >= 0) return direct;
  return 0;
}

export function workflowInfo(status: RequestStatus): { title: string; desc: string } {
  return STATUS_INFO[status] ?? { title: status, desc: '' };
}

export const WorkflowStepper: React.FC<{ status: RequestStatus; compact?: boolean }> = ({ status, compact }) => {
  const current = stepIndex(status);
  const terminal = status === 'DEVUELTO' || status === 'RECHAZADO';
  const profitError = status === 'ERROR_PROFIT';
  return (
    <ol className={`wf-stepper${compact ? ' wf-compact' : ''}`} aria-label={`Etapa actual: ${workflowInfo(status).title}`}>
      {MAIN_FLOW.map((step, i) => {
        const done = current >= 0 && i < current;
        const isCurrent = i === current && !terminal && !profitError;
        const state = done ? 'completado' : isCurrent ? 'actual' : 'pendiente';
        return (
          <li
            key={step.code}
            className={`wf-step${done ? ' wf-done' : ''}${isCurrent ? ' wf-current' : ''}`}
            aria-current={isCurrent ? 'step' : undefined}
            aria-label={`${step.label}: ${state}`}
          >
            <span className="wf-dot" aria-hidden="true">{done ? '✓' : isCurrent ? '●' : '○'}</span>
            <span>{step.label}</span>
          </li>
        );
      })}
      {terminal && (
        <li className={`wf-step${status === 'DEVUELTO' ? ' wf-current' : ' wf-error'}`} aria-label={`${workflowInfo(status).title}: actual`}>
          <span className="wf-dot" aria-hidden="true">{status === 'RECHAZADO' ? '✕' : '↩'}</span>
          <span>{workflowInfo(status).title}</span>
        </li>
      )}
      {profitError && (
        <li className="wf-step wf-error" aria-label="Error de registro en Profit: actual">
          <span className="wf-dot" aria-hidden="true">!</span>
          <span>Error de registro en Profit</span>
        </li>
      )}
    </ol>
  );
};

/** Bloque contextual del estado actual: qué etapa es y qué falta. */
export const WorkflowStatusInfo: React.FC<{ status: RequestStatus }> = ({ status }) => {
  const info = workflowInfo(status);
  return (
    <div className="card p16">
      <strong>{info.title}</strong>
      {info.desc && <p className="muted small" style={{ marginTop: 4 }}>{info.desc}</p>}
    </div>
  );
};
