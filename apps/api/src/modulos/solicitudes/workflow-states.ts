import { BadRequestException } from '@nestjs/common';

/**
 * FASE 8G — Estados canónicos del workflow en español.
 *
 * Fuente única de verdad para los nombres de estado persistidos en:
 * requests.status, workflow_instances.current_step_code, workflow_tasks.step_code,
 * workflow_history.from_step/to_step y approvals.step_code/from_status/to_status.
 *
 * FASE 16A — Reestructuración: Contabilidad es la última aprobación humana.
 * Eliminados PENDIENTE_VALIDACION_MAESTRA, APROBADO_FINAL y REGISTRADO_PROFIT.
 * Nuevos: CONTABILIDAD_APROBADA (puerta a Profit) e INSERTADO_PROFIT
 * (INSERT + VERIFY exitosos). Migración: prisma/migrate-reestructuracion-16a.js.
 * Las auditorías históricas conservan los valores antiguos (trail inmutable).
 */
export const WORKFLOW_STATES = [
  'BORRADOR',
  'PENDIENTE_GERENTE',
  'PENDIENTE_ALMACEN',
  'ALMACEN_APROBADO',
  'PENDIENTE_CONTABILIDAD',
  'CONTABILIDAD_APROBADA',
  'PROCESANDO_PROFIT',
  'INSERTADO_PROFIT',
  'ERROR_PROFIT',
  'DEVUELTO',
  'RECHAZADO',
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

/** Secuencia canónica oficial (16A). ERROR_PROFIT es rama técnica de PROCESANDO_PROFIT. */
export const WORKFLOW_SEQUENCE: readonly WorkflowState[] = [
  'BORRADOR',
  'PENDIENTE_GERENTE',
  'PENDIENTE_ALMACEN',
  'ALMACEN_APROBADO',
  'PENDIENTE_CONTABILIDAD',
  'CONTABILIDAD_APROBADA',
  'PROCESANDO_PROFIT',
  'INSERTADO_PROFIT',
];

/** Mapeo de migración: estado antiguo → estado nuevo vigente. */
export const WORKFLOW_STATE_MIGRATION: Readonly<Record<string, WorkflowState>> = {
  DRAFT: 'BORRADOR',
  PENDING_MANAGER: 'PENDIENTE_GERENTE',
  PENDING_WAREHOUSE: 'PENDIENTE_ALMACEN',
  WAREHOUSE_APPROVED: 'ALMACEN_APROBADO',
  PENDING_ACCOUNTING: 'PENDIENTE_CONTABILIDAD',
  // 16A — etapas humanas eliminadas: ya pasaron Contabilidad.
  PENDING_FINAL_REVIEW: 'CONTABILIDAD_APROBADA',
  PENDING_MASTER: 'CONTABILIDAD_APROBADA',
  FINAL_APPROVED: 'CONTABILIDAD_APROBADA',
  APPROVED: 'CONTABILIDAD_APROBADA',
  RETURNED: 'DEVUELTO',
  REJECTED: 'RECHAZADO',
  PROFIT_PROCESSING: 'PROCESANDO_PROFIT',
  PROFIT_INSERTED: 'INSERTADO_PROFIT',
};

export type WorkflowAction = 'APPROVE' | 'REJECT' | 'RETURN' | 'SUBMIT';

/**
 * Tabla de transiciones (16A). Contabilidad es la última aprobación humana:
 * PENDIENTE_CONTABILIDAD → CONTABILIDAD_APROBADA. Lo posterior es técnico
 * (motor Profit, actualizaciones directas, sin APPROVE).
 */
const TRANSITIONS: Record<string, Partial<Record<WorkflowAction, WorkflowState>>> = {
  PENDIENTE_GERENTE: { APPROVE: 'PENDIENTE_ALMACEN', REJECT: 'RECHAZADO', RETURN: 'BORRADOR' },
  PENDIENTE_ALMACEN: { APPROVE: 'ALMACEN_APROBADO', REJECT: 'RECHAZADO', RETURN: 'PENDIENTE_GERENTE' },
  PENDIENTE_CONTABILIDAD: { APPROVE: 'CONTABILIDAD_APROBADA', REJECT: 'RECHAZADO', RETURN: 'PENDIENTE_ALMACEN' },
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
  return status === 'BORRADOR' || status === 'INSERTADO_PROFIT' || status === 'RECHAZADO';
}
