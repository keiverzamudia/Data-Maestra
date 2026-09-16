// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { HomeIndex } from '../../app/App';
import { apiNotificacionService } from '../../servicios/api/api-notificacion-service';
import { apiRolesService } from '../../servicios/api/api-roles-service';

vi.mock('../../servicios/api/api-notificacion-service', () => ({
  apiNotificacionService: { getNotificaciones: vi.fn(), getUnreadCount: vi.fn(), markAsRead: vi.fn(), markAllAsRead: vi.fn() },
}));
vi.mock('../../servicios/api/api-roles-service', () => ({
  apiRolesService: { miVista: vi.fn() },
}));
vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));
vi.mock('../../contextos/CompanyContext', () => ({ useCompany: vi.fn() }));

import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';

const miVistaMock = apiRolesService.miVista as any;

function mockCtx(permissions: string[]) {
  (useSession as any).mockReturnValue({
    user: { displayName: 'Normal' }, roleCodes: ['REQUESTER'], logout: vi.fn(),
    hasPermission: (p: string) => permissions.includes(p),
  });
  (useCompany as any).mockReturnValue({ companyId: 'c1', setCompanyId: vi.fn(), companies: [{ id: 'c1', name: 'E1' }] });
  (apiNotificacionService.getNotificaciones as any).mockResolvedValue([]);
  (apiNotificacionService.getUnreadCount as any).mockResolvedValue(0);
}

describe('FASE 20 — sidebar independiente de DASHBOARD.VIEW', () => {
  beforeEach(() => { vi.clearAllMocks(); mockCtx(['REQUEST.VIEW', 'REQUEST.CREATE']); });
  afterEach(() => cleanup());

  it('1-3: sin DASHBOARD.VIEW no hay Dashboard; con REQUEST.VIEW/CREATE hay Mis + Crear', async () => {
    render(<MemoryRouter><AppLayout><div>x</div></AppLayout></MemoryRouter>);
    await waitFor(() => expect(screen.getByTitle('Mis solicitudes')).toBeTruthy());
    expect(screen.getByTitle('Mis solicitudes').tagName).toBe('A');
    expect(screen.getByTitle('Crear solicitud').tagName).toBe('A');
    expect(screen.queryByTitle('Dashboard Gerencial')).toBeNull();
  });

  it('6: con DASHBOARD.VIEW el Dashboard no cambia', async () => {
    mockCtx(['DASHBOARD.VIEW', 'REQUEST.VIEW', 'REQUEST.CREATE']);
    render(<MemoryRouter><AppLayout><div>x</div></AppLayout></MemoryRouter>);
    await waitFor(() => expect(screen.getByTitle('Dashboard Gerencial')).toBeTruthy());
    expect(screen.getByTitle('Dashboard Gerencial').tagName).toBe('A');
  });
});

describe('FASE 20 — HomeIndex (fuente única de vista principal)', () => {
  beforeEach(() => { vi.clearAllMocks(); mockCtx(['REQUEST.VIEW', 'REQUEST.CREATE']); });
  afterEach(() => cleanup());

  function renderHome() {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomeIndex />} />
          <Route path="/solicitudes" element={<div>Página Mis solicitudes</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('5 (Caso B): sin DASHBOARD.VIEW termina en /solicitudes', async () => {
    miVistaMock.mockResolvedValue({ key: 'solicitudes', label: 'Mis solicitudes', route: '/solicitudes', permission: 'REQUEST.VIEW' });
    renderHome();
    expect(await screen.findByText('Página Mis solicitudes')).toBeTruthy();
  });

  it('Caso E: defaultView sin permiso resuelve a vista permitida', async () => {
    miVistaMock.mockResolvedValue({ key: 'solicitudes', label: 'Mis solicitudes', route: '/solicitudes', permission: 'REQUEST.VIEW' });
    renderHome();
    expect(await screen.findByText('Página Mis solicitudes')).toBeTruthy();
    expect(miVistaMock).toHaveBeenCalled();
  });
});
