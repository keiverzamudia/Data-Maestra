import { describe, it, expect } from 'vitest';
import {
  WORKFLOW_STATES,
  WORKFLOW_SEQUENCE,
  WORKFLOW_STATE_MIGRATION,
  getNextWorkflowState,
  isTerminalWorkflowState,
} from '../src/modulos/solicitudes/workflow-states';

describe('FASE 8G — Estados normalizados del workflow', () => {
  it('existen los 10 estados oficiales', () => {
    for (const s of [
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
    ]) {
      expect(WORKFLOW_STATES).toContain(s);
    }
  });

  it('la secuencia canónica respeta el orden oficial', () => {
    expect(WORKFLOW_SEQUENCE).toEqual([
      'BORRADOR',
      'PENDIENTE_GERENTE',
      'PENDIENTE_ALMACEN',
      'ALMACEN_APROBADO',
      'PENDIENTE_CONTABILIDAD',
      'PENDIENTE_VALIDACION_MAESTRA',
      'APROBADO_FINAL',
      'PROCESANDO_PROFIT',
      'REGISTRADO_PROFIT',
    ]);
  });

  it('avanza por la ruta principal con APPROVE', () => {
    expect(getNextWorkflowState('PENDIENTE_GERENTE', 'APPROVE')).toBe('PENDIENTE_ALMACEN');
    expect(getNextWorkflowState('PENDIENTE_ALMACEN', 'APPROVE')).toBe('PENDIENTE_CONTABILIDAD');
    expect(getNextWorkflowState('ALMACEN_APROBADO', 'APPROVE')).toBe('PENDIENTE_CONTABILIDAD');
    expect(getNextWorkflowState('PENDIENTE_CONTABILIDAD', 'APPROVE')).toBe('PENDIENTE_VALIDACION_MAESTRA');
    expect(getNextWorkflowState('PENDIENTE_VALIDACION_MAESTRA', 'APPROVE')).toBe('APROBADO_FINAL');
  });

  it('Contabilidad devuelve a Almacén con RETURN', () => {
    expect(getNextWorkflowState('PENDIENTE_CONTABILIDAD', 'RETURN')).toBe('PENDIENTE_ALMACEN');
  });

  it('conserva los demás retornos y rechazos', () => {
    expect(getNextWorkflowState('PENDIENTE_GERENTE', 'RETURN')).toBe('BORRADOR');
    expect(getNextWorkflowState('PENDIENTE_ALMACEN', 'RETURN')).toBe('PENDIENTE_GERENTE');
    expect(getNextWorkflowState('PENDIENTE_VALIDACION_MAESTRA', 'RETURN')).toBe('PENDIENTE_CONTABILIDAD');
    expect(getNextWorkflowState('PENDIENTE_GERENTE', 'REJECT')).toBe('RECHAZADO');
    expect(getNextWorkflowState('PENDIENTE_CONTABILIDAD', 'REJECT')).toBe('RECHAZADO');
  });

  it('ERROR_PROFIT no tiene transición automática (rama técnica)', () => {
    expect(() => getNextWorkflowState('PROCESANDO_PROFIT', 'APPROVE')).toThrow();
    expect(() => getNextWorkflowState('ERROR_PROFIT', 'APPROVE')).toThrow();
  });

  it('marca terminales correctamente', () => {
    expect(isTerminalWorkflowState('BORRADOR')).toBe(true);
    expect(isTerminalWorkflowState('APROBADO_FINAL')).toBe(true);
    expect(isTerminalWorkflowState('RECHAZADO')).toBe(true);
    expect(isTerminalWorkflowState('PENDIENTE_GERENTE')).toBe(false);
    expect(isTerminalWorkflowState('PENDIENTE_CONTABILIDAD')).toBe(false);
  });

  it('el mapa de migración cubre todos los estados antiguos reales', () => {
    expect(WORKFLOW_STATE_MIGRATION).toMatchObject({
      DRAFT: 'BORRADOR',
      PENDING_MANAGER: 'PENDIENTE_GERENTE',
      PENDING_WAREHOUSE: 'PENDIENTE_ALMACEN',
      WAREHOUSE_APPROVED: 'ALMACEN_APROBADO',
      PENDING_ACCOUNTING: 'PENDIENTE_CONTABILIDAD',
      PENDING_FINAL_REVIEW: 'PENDIENTE_VALIDACION_MAESTRA',
      APPROVED: 'APROBADO_FINAL',
      REJECTED: 'RECHAZADO',
    });
  });
});
