import { BadRequestException } from '@nestjs/common';

/**
 * FASE 8G — Estados canónicos del workflow en español.
 *
 * Fuente única de verdad para los nombres de estado persistidos en:
 * requests.status, workflow_instances.current_step_code, workflow_tasks.step_code,
 * workflow_history.from_step/to_step y approvals.step_code/from_status/to_status.
 *
 * Notas de normalización (ver docs/NORMALIZACION_ESTADOS_8G.md):
 * - PENDING_FINAL_REVIEW (estado real de revisión final) → PENDIENTE_VALIDACION_MAESTRA.
 *   PENDING_MASTER nunca existió en código ni datos.
 * - APPROVED (estado final real producido por revisión final) → APROBADO_FINAL.
 *   FINAL_APPROVED nunca existió en código ni datos.
 * - REJECTED → RECHAZADO y RETURNED → DEVUELTO se conservan renombrados porque
 *   el backend persiste REJECTED y el panel/frontend referencian RETURNED.
 * - PROFIT_* existen como constantes pero SIN transiciones implementadas (8G no
 *   implementa Validación Maestra completa ni escritura en Profit).
 */
export const WORKFLOW_STATES = [
  'BORRADOR',
  'PENDIENTE_GERENTE',
  'PENDIENTE_ALMACEN',
  'ALMACEN_APROBADO',
  'PENDIENTE_CONTABILIDAD',
  'PENDIENTE_VALIDACION_MAESTRA',
  'APROBADO_FINAL',
  'PROCESANDO_PROFIT',
  'REGISTRADO_PROFIT',
  'ERROR_PROFIT',
  'DEVUELTO',
  'RECHAZADO',
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

/** Secuencia canónica oficial (8G). ERROR_PROFIT es rama técnica de PROCESANDO_PROFIT. */
export const WORKFLOW_SEQUENCE: readonly WorkflowState[] = [
  'BORRADOR',
  'PENDIENTE_GERENTE',
  'PENDIENTE_ALMACEN',
  'ALMACEN_APROBADO',
  'PENDIENTE_CONTABILIDAD',
  'PENDIENTE_VALIDACION_MAESTRA',
  'APROBADO_FINAL',
  'PROCESANDO_PROFIT',
  'REGISTRADO_PROFIT',
];

/** Mapeo de migración 8G: estado antiguo (inglés) → estado nuevo (español). */
export const WORKFLOW_STATE_MIGRATION: Readonly<Record<string, WorkflowState>> = {
  DRAFT: 'BORRADOR',
  PENDING_MANAGER: 'PENDIENTE_GERENTE',
  PENDING_WAREHOUSE: 'PENDIENTE_ALMACEN',
  WAREHOUSE_APPROVED: 'ALMACEN_APROBADO',
  PENDING_ACCOUNTING: 'PENDIENTE_CONTABILIDAD',
  PENDING_FINAL_REVIEW: 'PENDIENTE_VALIDACION_MAESTRA',
  PENDING_MASTER: 'PENDIENTE_VALIDACION_MAESTRA',
  FINAL_APPROVED: 'APROBADO_FINAL',
  APPROVED: 'APROBADO_FINAL',
  RETURNED: 'DEVUELTO',
  REJECTED: 'RECHAZADO',
  PROFIT_PROCESSING: 'PROCESANDO_PROFIT',
  PROFIT_INSERTED: 'REGISTRADO_PROFIT',
  PROFIT_ERROR: 'ERROR_PROFIT',
};

export type WorkflowAction = 'APPROVE' | 'REJECT' | 'RETURN' | 'SUBMIT';

/**
 * Tabla de transiciones. Idéntica semántica al workflow pre-8G, solo renombrada.
 * No incluye transiciones hacia PROFIT_* (fuera del alcance de 8G).
 */
const TRANSITIONS: Record<string, Partial<Record<WorkflowAction, WorkflowState>>> = {
  PENDIENTE_GERENTE: { APPROVE: 'PENDIENTE_ALMACEN', REJECT: 'RECHAZADO', RETURN: 'BORRADOR' },
  PENDIENTE_ALMACEN: { APPROVE: 'PENDIENTE_CONTABILIDAD', REJECT: 'RECHAZADO', RETURN: 'PENDIENTE_GERENTE' },
  PENDIENTE_CONTABILIDAD: { APPROVE: 'PENDIENTE_VALIDACION_MAESTRA', REJECT: 'RECHAZADO', RETURN: 'PENDIENTE_ALMACEN' },
  PENDIENTE_VALIDACION_MAESTRA: { APPROVE: 'APROBADO_FINAL', REJECT: 'RECHAZADO', RETURN: 'PENDIENTE_CONTABILIDAD' },
  ALMACEN_APROBADO: { APPROVE: 'PENDIENTE_CONTABILIDAD', REJECT: 'RECHAZADO', RETURN: 'PENDIENTE_GERENTE' },
};

export function getNextWorkflowState(currentStatus: string, action: string): WorkflowState {
  const next = TRANSITIONS[currentStatus]?.[action as WorkflowAction];
  if (!next) {
    throw new BadRequestException(`Invalid transition: ${currentStatus} -> ${action}`);
  }
  return next;
}

/** Estados terminales: no admiten ninguna acción posterior. */
export function isTerminalWorkflowState(status: string): boolean {
  return status === 'BORRADOR' || status === 'APROBADO_FINAL' || status === 'RECHAZADO';
}
