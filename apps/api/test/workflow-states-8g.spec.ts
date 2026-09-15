import { describe, it, expect } from 'vitest';
import {
  WORKFLOW_STATES,
  WORKFLOW_SEQUENCE,
  WORKFLOW_STATE_MIGRATION,
  getNextWorkflowState,
  isTerminalWorkflowState,
} from '../src/modulos/solicitudes/workflow-states';

describe('FASE 8G/16A — Estados del workflow', () => {
  it('existen los estados oficiales (16A: sin VM/AF/REGISTRADO_PROFIT)', () => {
    for (const s of [
      'BORRADOR',
      'PENDIENTE_GERENTE',
      'PENDIENTE_ALMACEN',
      'ALMACEN_APROBADO',
      'PENDIENTE_CONTABILIDAD',
      'CONTABILIDAD_APROBADA',
      'PROCESANDO_PROFIT',
      'INSERTADO_PROFIT',
      'ERROR_PROFIT',
    ]) {
      expect(WORKFLOW_STATES).toContain(s);
    }
    for (const s of ['PENDIENTE_VALIDACION_MAESTRA', 'APROBADO_FINAL', 'REGISTRADO_PROFIT']) {
      expect(WORKFLOW_STATES).not.toContain(s);
    }
  });

  it('la secuencia canónica respeta el orden oficial', () => {
    expect(WORKFLOW_SEQUENCE).toEqual([
      'BORRADOR',
      'PENDIENTE_GERENTE',
      'PENDIENTE_ALMACEN',
      'ALMACEN_APROBADO',
      'PENDIENTE_CONTABILIDAD',
      'CONTABILIDAD_APROBADA',
      'PROCESANDO_PROFIT',
      'INSERTADO_PROFIT',
    ]);
  });

  it('avanza por la ruta principal con APPROVE (Contabilidad es la última humana)', () => {
    expect(getNextWorkflowState('PENDIENTE_GERENTE', 'APPROVE')).toBe('PENDIENTE_ALMACEN');
    expect(getNextWorkflowState('PENDIENTE_ALMACEN', 'APPROVE')).toBe('ALMACEN_APROBADO');
    expect(getNextWorkflowState('ALMACEN_APROBADO', 'APPROVE')).toBe('PENDIENTE_CONTABILIDAD');
    expect(getNextWorkflowState('PENDIENTE_CONTABILIDAD', 'APPROVE')).toBe('CONTABILIDAD_APROBADA');
  });

  it('lo posterior a Contabilidad es técnico: sin transiciones APPROVE', () => {
    expect(() => getNextWorkflowState('CONTABILIDAD_APROBADA', 'APPROVE')).toThrow();
    expect(() => getNextWorkflowState('PENDIENTE_VALIDACION_MAESTRA', 'APPROVE')).toThrow();
    expect(() => getNextWorkflowState('PROCESANDO_PROFIT', 'APPROVE')).toThrow();
  });

  it('Contabilidad devuelve a Almacén con RETURN', () => {
    expect(getNextWorkflowState('PENDIENTE_CONTABILIDAD', 'RETURN')).toBe('PENDIENTE_ALMACEN');
  });

  it('conserva los demás retornos y rechazos', () => {
    expect(getNextWorkflowState('PENDIENTE_GERENTE', 'RETURN')).toBe('BORRADOR');
    expect(getNextWorkflowState('PENDIENTE_ALMACEN', 'RETURN')).toBe('PENDIENTE_GERENTE');
    expect(getNextWorkflowState('PENDIENTE_GERENTE', 'REJECT')).toBe('RECHAZADO');
    expect(getNextWorkflowState('PENDIENTE_CONTABILIDAD', 'REJECT')).toBe('RECHAZADO');
  });

  it('ERROR_PROFIT no tiene transición automática (rama técnica)', () => {
    expect(() => getNextWorkflowState('ERROR_PROFIT', 'APPROVE')).toThrow();
  });

  it('marca terminales correctamente', () => {
    expect(isTerminalWorkflowState('BORRADOR')).toBe(true);
    expect(isTerminalWorkflowState('INSERTADO_PROFIT')).toBe(true);
    expect(isTerminalWorkflowState('RECHAZADO')).toBe(true);
    expect(isTerminalWorkflowState('PENDIENTE_GERENTE')).toBe(false);
    expect(isTerminalWorkflowState('PENDIENTE_CONTABILIDAD')).toBe(false);
    expect(isTerminalWorkflowState('CONTABILIDAD_APROBADA')).toBe(false);
  });

  it('el mapa de migración lleva las etapas eliminadas a CONTABILIDAD_APROBADA', () => {
    expect(WORKFLOW_STATE_MIGRATION).toMatchObject({
      DRAFT: 'BORRADOR',
      PENDING_MANAGER: 'PENDIENTE_GERENTE',
      PENDING_WAREHOUSE: 'PENDIENTE_ALMACEN',
      WAREHOUSE_APPROVED: 'ALMACEN_APROBADO',
      PENDING_ACCOUNTING: 'PENDIENTE_CONTABILIDAD',
      PENDING_FINAL_REVIEW: 'CONTABILIDAD_APROBADA',
      FINAL_APPROVED: 'CONTABILIDAD_APROBADA',
      APPROVED: 'CONTABILIDAD_APROBADA',
      REJECTED: 'RECHAZADO',
      PROFIT_INSERTED: 'INSERTADO_PROFIT',
    });
  });
});
