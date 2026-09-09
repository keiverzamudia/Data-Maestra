// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Alert, Spinner, Skeleton, ErrorState, ConfirmDialog, Drawer, Field, Page } from './index';

describe('Design System 11A', () => {
  afterEach(() => cleanup());

  it('Alert por tonos con role=alert', () => {
    const { unmount } = render(<Alert tone="danger">E</Alert>);
    expect(screen.getByRole('alert').className).toMatch(/alert-danger/);
    unmount(); cleanup();
    render(<Alert tone="success">S</Alert>);
    expect(screen.getByRole('alert').className).toMatch(/alert-success/);
  });

  it('Spinner y Skeleton accesibles', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toBeTruthy();
    cleanup();
    render(<Skeleton />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('ErrorState con reintento', () => {
    const retry = vi.fn();
    render(<ErrorState desc="d" onRetry={retry} />);
    fireEvent.click(screen.getByText('Reintentar'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('ConfirmDialog confirma/cancela y null si cerrado', () => {
    const onConfirm = vi.fn(); const onCancel = vi.fn();
    const { container } = render(<ConfirmDialog open={false} title="T" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(container.innerHTML).toBe('');
    render(<ConfirmDialog open title="Borrar" desc="¿Seguro?" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Confirmar'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Drawer abre/cierra con título', () => {
    const onClose = vi.fn();
    const { container } = render(<Drawer open={false} onClose={onClose} title="D">x</Drawer>);
    expect(container.innerHTML).toBe('');
    render(<Drawer open onClose={onClose} title="Detalle">contenido</Drawer>);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Cerrar'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Field muestra required, helper y error', () => {
    render(<Field label="Nombre" required helper="h" error="e"><input /></Field>);
    expect(screen.getByText('Nombre')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('e');
  });

  it('Page con título y acciones', () => {
    render(<Page title="Título" desc="d" actions={<button>Acc</button>}><span>C</span></Page>);
    expect(screen.getByText('Título')).toBeTruthy();
    expect(screen.getByText('Acc')).toBeTruthy();
  });
});
