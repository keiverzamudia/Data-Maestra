// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MantenimientoSection } from './MantenimientoSection';

vi.mock('../../servicios/api/api-mantenimiento-service', () => ({
  apiMantenimientoService: { getResetPreview: vi.fn(), resetTestData: vi.fn() },
}));

import { apiMantenimientoService } from '../../servicios/api/api-mantenimiento-service';

const previewMock = apiMantenimientoService.getResetPreview as any;
const resetMock = apiMantenimientoService.resetTestData as any;

const PREVIEW = {
  tables: [
    { table: 'request', label: 'Solicitudes', count: 2 },
    { table: 'audit_event', label: 'Auditoría', count: 5 },
  ],
  total: 7,
};

describe('MantenimientoSection (modo pruebas)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewMock.mockResolvedValue(structuredClone(PREVIEW));
    resetMock.mockResolvedValue({ deleted: { request: 2, audit_event: 5 }, total: 7, executedAt: '2026-09-22T10:00:00.000Z', actorId: 'admin' });
  });
  afterEach(() => cleanup());

  it('muestra advertencia irreversible y vista previa', async () => {
    render(<MemoryRouter><MantenimientoSection /></MemoryRouter>);
    expect(await screen.findByText(/Operación irreversible/)).toBeTruthy();
    expect(await screen.findByText('Solicitudes')).toBeTruthy();
    expect(screen.getByText(/7 registro/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Borrar datos de prueba' })).toBeTruthy();
  });

  it('exige confirmación escrita BORRAR TODO', async () => {
    render(<MemoryRouter><MantenimientoSection /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Borrar datos de prueba' }));
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Confirmar borrado' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByPlaceholderText('BORRAR TODO'), { target: { value: 'BORRAR' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(dialog).getByPlaceholderText('BORRAR TODO'), { target: { value: 'BORRAR TODO' } });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(resetMock).toHaveBeenCalledWith('BORRAR TODO');
    expect(await screen.findByText(/Borrado completado/)).toBeTruthy();
    expect(previewMock).toHaveBeenCalledTimes(2);
  });

  it('sin flag (403) muestra no disponible y sin botón', async () => {
    previewMock.mockRejectedValue({ status: 403, message: 'deshabilitado' });
    render(<MemoryRouter><MantenimientoSection /></MemoryRouter>);
    expect(await screen.findByText(/no disponible/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Borrar datos de prueba' })).toBeNull();
  });

  it('error de carga muestra reintento', async () => {
    previewMock.mockRejectedValue(new Error('red caída'));
    render(<MemoryRouter><MantenimientoSection /></MemoryRouter>);
    expect(await screen.findByText('No pudimos cargar la vista previa del borrado.')).toBeTruthy();
  });

  it('error al borrar muestra mensaje y no rompe', async () => {
    resetMock.mockRejectedValue({ status: 500, message: 'falló el borrado' });
    render(<MemoryRouter><MantenimientoSection /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Borrar datos de prueba' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByPlaceholderText('BORRAR TODO'), { target: { value: 'BORRAR TODO' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar borrado' }));
    expect(await screen.findByText('falló el borrado')).toBeTruthy();
  });
});
