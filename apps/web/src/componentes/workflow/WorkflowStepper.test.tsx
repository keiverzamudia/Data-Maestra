// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WorkflowStepper, WorkflowStatusInfo, workflowInfo } from './WorkflowStepper';

describe('WorkflowStepper 11B', () => {
  afterEach(() => cleanup());

  it('marca actual, completados y futuros', () => {
    render(<WorkflowStepper status="PENDIENTE_ALMACEN" />);
    expect(screen.getByLabelText('Pendiente de Almacén: actual')).toBeTruthy();
    expect(screen.getByLabelText('Solicitud creada: completado')).toBeTruthy();
    expect(screen.getByLabelText('Aprobación Final: pendiente')).toBeTruthy();
  });

  it('usa etiquetas humanas, no enums', () => {
    render(<WorkflowStepper status="BORRADOR" />);
    expect(screen.getByText('Solicitud creada')).toBeTruthy();
    expect(screen.queryByText('BORRADOR')).toBeNull();
    expect(workflowInfo('PENDIENTE_GERENTE').title).toBe('Pendiente de aprobación');
    expect(workflowInfo('REGISTRADO_PROFIT').title).toBe('Registrado en Profit');
  });

  it('ERROR_PROFIT con marca de error técnico', () => {
    render(<WorkflowStepper status="ERROR_PROFIT" />);
    expect(screen.getByLabelText(/Error de registro en Profit: actual/)).toBeTruthy();
    expect(screen.getByText('Error de registro en Profit')).toBeTruthy();
  });

  it('RECHAZADO y DEVUELTO como terminales', () => {
    render(<WorkflowStepper status="RECHAZADO" />);
    expect(screen.getByText('Rechazada')).toBeTruthy();
    cleanup();
    render(<WorkflowStepper status="DEVUELTO" />);
    expect(screen.getByText('Devuelta')).toBeTruthy();
  });

  it('expone etapa actual a lectores de pantalla', () => {
    render(<WorkflowStepper status="PENDIENTE_CONTABILIDAD" />);
    expect(screen.getByRole('list', { name: /Pendiente de Contabilidad/ })).toBeTruthy();
  });

  it('WorkflowStatusInfo deriva título y contexto del estado', () => {
    render(<WorkflowStatusInfo status="PENDIENTE_CONTABILIDAD" />);
    expect(screen.getByText('Pendiente de Contabilidad')).toBeTruthy();
    expect(screen.getByText(/requiere aprobación del área de Contabilidad/)).toBeTruthy();
  });
});
