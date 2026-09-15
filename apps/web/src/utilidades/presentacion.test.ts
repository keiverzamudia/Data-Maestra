// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  getRoleLabel,
  getRoleDescription,
  getPermissionLabel,
  getAuditActionLabel,
} from './presentacion';

describe('presentacion 12H — catálogo en español', () => {
  it('roles oficiales con nombre y descripción', () => {
    expect(getRoleLabel('MASTER_DATA_ADMIN')).toBe('Administrador Maestro de Datos');
    expect(getRoleLabel('WAREHOUSE')).toBe('Almacén');
    expect(getRoleLabel('ACCOUNTING')).toBe('Contabilidad');
    expect(getRoleLabel('DEPARTMENT_MANAGER')).toBe('Jefe de Departamento');
    expect(getRoleLabel('REQUESTER')).toBe('Solicitante');
    // 15A — Encargado de Almacén.
    expect(getRoleLabel('WAREHOUSE_MANAGER')).toBe('Encargado de Almacén');
    expect(getRoleDescription('WAREHOUSE_MANAGER')).toMatch(/Contabilidad/);
    expect(getRoleDescription('ACCOUNTING')).toMatch(/Profit/);
    expect(getRoleDescription('REQUESTER')).toMatch(/seguimiento/);
  });

  it('desconocidos usan fallback sin romper', () => {
    expect(getRoleLabel('AUDITOR', 'Auditor')).toBe('Auditor');
    // 16A — rol de revisión final fuera del catálogo operativo.
    expect(getRoleLabel('FINAL_REVIEWER')).toBe('FINAL_REVIEWER');
    expect(getRoleLabel('XXX')).toBe('XXX');
    expect(getRoleDescription('XXX')).toBeNull();
  });

  it('permisos con nombre funcional (13 del seed)', () => {
    const cases: Array<[string, string]> = [
      ['REQUEST.CREATE', 'Crear solicitudes'],
      ['REQUEST.VIEW', 'Consultar solicitudes'],
      ['WAREHOUSE.CLASSIFY', 'Clasificar artículos'],
      ['WAREHOUSE.VIEW', 'Consultar solicitudes de Almacén'],
      // 15A — permisos del Encargado de Almacén.
      ['WAREHOUSE_MANAGER.APPROVE', 'Aprobar clasificaciones de Almacén'],
      ['WAREHOUSE_MANAGER.VIEW', 'Consultar aprobaciones de Almacén'],
      ['ACCOUNTING.APPROVE', 'Aprobar validación contable'],
      ['ACCOUNTING.VIEW', 'Consultar solicitudes de Contabilidad'],
      ['MANAGER.APPROVE', 'Aprobar solicitudes del departamento'],
      ['DASHBOARD.VIEW', 'Consultar panel principal'],
      ['ADMIN.MANAGE', 'Administrar configuración'],
      ['AUDIT.VIEW', 'Consultar auditoría'],
      ['IMPORT.RUN', 'Ejecutar importaciones'],
      ['IMPORT.VIEW', 'Consultar importaciones'],
    ];
    for (const [code, label] of cases) expect(getPermissionLabel(code)).toBe(label);
    expect(getPermissionLabel('FUTURE.X')).toBe('FUTURE.X');
  });

  it('acciones de auditoría comprensibles', () => {
    expect(getAuditActionLabel('ROLE_ASSIGNED_BULK')).toBe('Roles asignados masivamente');
    expect(getAuditActionLabel('USER_ACTIVATED')).toBe('Usuario activado');
    expect(getAuditActionLabel('USER_PERMISSION_DENIED')).toBe('Permiso denegado');
    expect(getAuditActionLabel('LOGIN_EXITOSO')).toBe('Inicio de sesión');
    expect(getAuditActionLabel('DEPARTMENT_UPDATED')).toBe('Departamento actualizado');
    expect(getAuditActionLabel('CLASSIFIED')).toBe('Artículo clasificado');
    expect(getAuditActionLabel('WHATEVER_NEW')).toBe('WHATEVER_NEW');
  });
});
