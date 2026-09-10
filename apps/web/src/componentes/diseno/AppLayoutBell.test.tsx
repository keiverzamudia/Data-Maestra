// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from '../../componentes/diseno/AppLayout';
import { apiNotificacionService } from '../../servicios/api/api-notificacion-service';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';

vi.mock('../../servicios/api/api-notificacion-service', () => ({
  apiNotificacionService: {
    getNotificaciones: vi.fn(),
    getUnreadCount: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  },
}));

vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));
vi.mock('../../contextos/CompanyContext', () => ({ useCompany: vi.fn() }));

const listMock = apiNotificacionService.getNotificaciones as any;
const countMock = apiNotificacionService.getUnreadCount as any;
const readMock = apiNotificacionService.markAsRead as any;
const allMock = apiNotificacionService.markAllAsRead as any;

const NOTIFS = [
  { id: 'n1', title: 'Solicitud REQ-0001 en PENDIENTE_ALMACEN', body: 'Requiere atención', type: 'PENDIENTE_ALMACEN', readAt: null, createdAt: '2026-09-01T10:00:00Z', link: '/requester/r1' },
  { id: 'n2', title: 'Aviso general', body: 'Info', type: 'info', readAt: '2026-08-30T11:00:00Z', createdAt: '2026-08-30T10:00:00Z' },
];

function mockAll() {
  (useSession as any).mockReturnValue({ user: { displayName: 'Admin Uno' }, roleCodes: ['ADMIN'], logout: vi.fn(), hasPermission: () => false });
  (useCompany as any).mockReturnValue({ companyId: 'c1', setCompanyId: vi.fn(), companies: [{ id: 'c1', name: 'Empresa A' }] });
  listMock.mockResolvedValue(structuredClone(NOTIFS));
  countMock.mockResolvedValue(1);
  readMock.mockResolvedValue(undefined);
  allMock.mockResolvedValue(undefined);
}

function renderShell() {
  return render(
    <MemoryRouter>
      <AppLayout><div>contenido</div></AppLayout>
    </MemoryRouter>,
  );
}

describe('Campana 11G', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAll(); });
  afterEach(() => cleanup());

  it('muestra contador de no leídas y lista propia al abrir', async () => {
    renderShell();
    expect(await screen.findByText('1')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Notificaciones'));
    expect(await screen.findByText('Solicitud REQ-0001 en PENDIENTE_ALMACEN')).toBeTruthy();
    expect(screen.getByText((_, el) => el?.textContent === 'Notificaciones (1 sin leer)')).toBeTruthy();
  });

  it('marcar leída descuenta el contador', async () => {
    renderShell();
    fireEvent.click(await screen.findByLabelText('Notificaciones'));
    await screen.findByText('Solicitud REQ-0001 en PENDIENTE_ALMACEN');
    listMock.mockResolvedValue([NOTIFS[1]]);
    countMock.mockResolvedValue(0);
    fireEvent.click(screen.getByText('Marcar leída'));
    expect(readMock).toHaveBeenCalledWith('n1');
    await waitFor(() => expect(screen.queryByText('Marcar leída')).toBeNull());
    expect(screen.queryByText(/sin leer/)).toBeNull();
  });

  it('marcar todas deja el contador en 0', async () => {
    renderShell();
    fireEvent.click(await screen.findByLabelText('Notificaciones'));
    fireEvent.click(await screen.findByText('Marcar todas'));
    expect(allMock).toHaveBeenCalled();
  });

  it('estado vacío cuando no hay notificaciones', async () => {
    listMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    renderShell();
    fireEvent.click(await screen.findByLabelText('Notificaciones'));
    expect(await screen.findByText('Sin notificaciones.')).toBeTruthy();
  });
});
