// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AuditPage } from './AuditoriaPage';
import { apiAuditService } from '../../servicios/api/api-audit-service';
import { useSession } from '../../contextos/SessionContext';

vi.mock('../../servicios/api/api-audit-service', () => ({
  apiAuditService: { getEvents: vi.fn(), getById: vi.fn() },
}));

vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));

const getEventsMock = apiAuditService.getEvents as any;
const getByIdMock = apiAuditService.getById as any;

const PAGE1 = {
  data: [
    { id: 'e1', correlationId: 'ABC123', actorId: 'u5', entityType: 'User', entityId: 'u1', action: 'ROLE_ASSIGNED_BULK', createdAt: '2026-09-01T10:00:00.000Z', actor: { id: 'u5', displayName: 'Luis Martínez', username: 'l.m' }, afectado: { id: 'u1', displayName: 'Juan Pérez', username: 'j.perez' } },
  ],
  total: 2, page: 1, limit: 20, totalPages: 2,
};

describe('AuditoriaPage 10K', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSession as any).mockReturnValue({ hasPermission: () => true });
    getEventsMock.mockResolvedValue(structuredClone(PAGE1));
  });
  afterEach(() => cleanup());

  it('render con loading y luego resultados reales', async () => {
    render(<AuditPage />);
    expect(screen.getByLabelText('Cargando auditoría')).toBeTruthy();
    expect(await screen.findByText('Luis Martínez')).toBeTruthy();
    expect(screen.getByText('Juan Pérez')).toBeTruthy();
    expect(getEventsMock).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
  });

  it('aplica filtros con Buscar', async () => {
    render(<AuditPage />);
    await screen.findByText('Luis Martínez');
    fireEvent.change(screen.getByLabelText('Acción'), { target: { value: 'ROLE_ASSIGNED_BULK' } });
    fireEvent.change(screen.getByLabelText('Correlation ID'), { target: { value: 'ABC123' } });
    fireEvent.click(screen.getByText('Buscar'));
    await waitFor(() => expect(getEventsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'ROLE_ASSIGNED_BULK', correlationId: 'ABC123', page: 1 }),
    ));
  });

  it('paginación Anterior/Siguiente con datos del backend', async () => {
    render(<AuditPage />);
    await screen.findByText('Página 1 de 2 (2 eventos)');
    getEventsMock.mockResolvedValueOnce({ ...structuredClone(PAGE1), data: [], page: 2 });
    fireEvent.click(screen.getByText('Siguiente'));
    await waitFor(() => expect(getEventsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  it('abre el detalle del evento', async () => {
    getByIdMock.mockResolvedValue(structuredClone(PAGE1.data[0]));
    render(<AuditPage />);
    fireEvent.click(await screen.findByText('Ver'));
    expect(await screen.findByText('Detalle de Evento')).toBeTruthy();
    expect(getByIdMock).toHaveBeenCalledWith('e1');
  });

  it('estado sin resultados', async () => {
    getEventsMock.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 1 });
    render(<AuditPage />);
    expect(await screen.findByText('Sin eventos')).toBeTruthy();
  });

  it('manejo de error sin tecnicismos', async () => {
    getEventsMock.mockRejectedValueOnce(new Error('Fallo de red'));
    render(<AuditPage />);
    expect(await screen.findByText('Fallo de red')).toBeTruthy();
  });

  it('sin permiso no muestra datos', async () => {
    (useSession as any).mockReturnValue({ hasPermission: () => false });
    render(<AuditPage />);
    expect(await screen.findByText(/Se requiere AUDIT.VIEW/)).toBeTruthy();
    expect(getEventsMock).not.toHaveBeenCalled();
  });

  it('detalle redacta valores sensibles', async () => {
    getByIdMock.mockResolvedValue({
      ...structuredClone(PAGE1.data[0]),
      afterData: JSON.stringify({ mustChangePassword: true, passwordHash: 'abc123', token: 'zzz' }),
    });
    render(<AuditPage />);
    fireEvent.click(await screen.findByText('Ver'));
    expect(await screen.findByText('Detalle de Evento')).toBeTruthy();
    expect(screen.getAllByText(/\[OCULTO\]/)).toHaveLength(2);
    expect(screen.queryByText(/abc123/)).toBeNull();
  });

  it('filtros colapsables con conteo y limpiar', async () => {
    render(<AuditPage />);
    await screen.findByText('Luis Martínez');
    fireEvent.change(screen.getByLabelText('Acción'), { target: { value: 'X' } });
    expect(await screen.findByText(/1 activos/)).toBeTruthy();
    fireEvent.click(screen.getByText('Limpiar'));
    expect(getEventsMock).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });
});
