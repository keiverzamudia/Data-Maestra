// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MenuBadge } from './MenuBadge';
import { AppLayout } from './AppLayout';
import { apiGetRequestContextSummary } from '../../servicios/api/api-request-summary-service';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';
import { apiNotificacionService } from '../../servicios/api/api-notificacion-service';

vi.mock('../../servicios/api/api-request-summary-service', () => ({
  apiGetRequestContextSummary: vi.fn(),
}));
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

const summaryMock = apiGetRequestContextSummary as any;

const SUMMARY = {
  work: {
    total: 6,
    approvals: 13,
    warehouse: 6,
    warehouseApproval: 3,
    accounting: 4,
    accountingApproval: 3,
    accountingProfitRegistration: 1,
    managementApproval: 13,
  },
  dashboard: { pending: 6, inApproval: 45, completed: 3, returned: 0 },
};

function mockSession(permissions: string[]) {
  (useSession as any).mockReturnValue({
    user: { displayName: 'Tester' },
    roleCodes: [],
    logout: vi.fn(),
    hasPermission: (p: string) => permissions.includes(p),
  });
  (useCompany as any).mockReturnValue({
    companyId: 'c1',
    setCompanyId: vi.fn(),
    companies: [{ id: 'c1', name: 'Empresa A' }],
  });
  (apiNotificacionService.getNotificaciones as any).mockResolvedValue([]);
  (apiNotificacionService.getUnreadCount as any).mockResolvedValue(0);
}

describe('MenuBadge', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('muestra 0 con estilo neutro', () => {
    render(<MenuBadge value={0} status="ready" label="pendientes" />);
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.getByText('0').className).toContain('nav-badge-zero');
  });

  it('muestra N>0 con énfasis', () => {
    render(<MenuBadge value={13} status="ready" label="pendientes" />);
    expect(screen.getByText('13')).toBeTruthy();
    expect(screen.getByText('13').className).toContain('nav-badge-active');
  });

  it('loading muestra … sin número falso', () => {
    render(<MenuBadge status="loading" label="pendientes" />);
    expect(screen.getByText('…')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('error muestra — y nunca inventa 0', () => {
    render(<MenuBadge status="error" label="pendientes" />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('value undefined en ready se trata como no disponible', () => {
    render(<MenuBadge status="ready" />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('limita a 99+ contadores muy grandes', () => {
    render(<MenuBadge value={150} status="ready" />);
    expect(screen.getByText('99+')).toBeTruthy();
  });
});

describe('Badges del menú (AppLayout)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession(['REQUEST.VIEW', 'WAREHOUSE.VIEW', 'WAREHOUSE_MANAGER.VIEW', 'ACCOUNTING.VIEW', 'MANAGER.APPROVE']);
    summaryMock.mockResolvedValue(structuredClone(SUMMARY));
  });
  afterEach(() => cleanup());

  it('un solo request de resumen y badges dinámicos por cola', async () => {
    render(
      <MemoryRouter>
        <AppLayout><div>x</div></AppLayout>
      </MemoryRouter>,
    );
    // Aprobaciones = 13, Almacén = 6, Aprobación Almacén = 3, Contabilidad = 4.
    expect(await screen.findByText('13')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(summaryMock).toHaveBeenCalledTimes(1);
  });

  it('sin ACCOUNTING.VIEW no se muestra Contabilidad (ni su badge)', async () => {
    mockSession(['REQUEST.VIEW', 'WAREHOUSE.VIEW']);
    render(
      <MemoryRouter>
        <AppLayout><div>x</div></AppLayout>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByTitle('Almacén')).toBeTruthy());
    expect(screen.queryByTitle('Contabilidad')).toBeNull();
    // El badge de Almacén sigue presente con el valor del resumen.
    expect(await screen.findByText('6')).toBeTruthy();
  });

  it('loading del resumen no muestra números falsos', async () => {
    summaryMock.mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter>
        <AppLayout><div>x</div></AppLayout>
      </MemoryRouter>,
    );
    // Mientras carga: puntos suspensivos en badges de trabajo.
    expect(await screen.findAllByText('…')).toBeTruthy();
    expect(screen.queryByText('13')).toBeNull();
  });

  it('error del resumen muestra — en badges', async () => {
    summaryMock.mockRejectedValue(new Error('boom'));
    render(
      <MemoryRouter>
        <AppLayout><div>x</div></AppLayout>
      </MemoryRouter>,
    );
    expect(await screen.findAllByText('—')).toBeTruthy();
    expect(screen.queryByText('13')).toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('evento dm:counters-refresh recarga el resumen (SSE)', async () => {
    render(
      <MemoryRouter>
        <AppLayout><div>x</div></AppLayout>
      </MemoryRouter>,
    );
    await screen.findByText('13');
    expect(summaryMock).toHaveBeenCalledTimes(1);
    summaryMock.mockResolvedValue({
      ...structuredClone(SUMMARY),
      work: { ...SUMMARY.work, warehouse: 9 },
    });
    window.dispatchEvent(new CustomEvent('dm:counters-refresh'));
    expect(await screen.findByText('9')).toBeTruthy();
    expect(summaryMock).toHaveBeenCalledTimes(2);
  });

  it('click en badge/entrada navega a la cola correspondiente', async () => {
    render(
      <MemoryRouter>
        <AppLayout><div>x</div></AppLayout>
      </MemoryRouter>,
    );
    await screen.findByText('6');
    fireEvent.click(screen.getByTitle('Almacén'));
    // MemoryRouter: el NavLink recibe el click (navegación interna).
    expect(screen.getByTitle('Almacén').getAttribute('href')).toBe('/warehouse');
  });
});
