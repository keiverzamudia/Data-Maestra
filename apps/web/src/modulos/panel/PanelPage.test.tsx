// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './PanelPage';
import { apiPanelService } from '../../servicios/api/api-panel-service';
import { apiGetRequestContextSummary } from '../../servicios/api/api-request-summary-service';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';

vi.mock('../../servicios/api/api-panel-service', () => ({
  apiPanelService: { getStats: vi.fn(), getActivity: vi.fn() },
}));
vi.mock('../../servicios/api/api-request-summary-service', () => ({
  apiGetRequestContextSummary: vi.fn(),
}));
vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));
vi.mock('../../contextos/CompanyContext', () => ({ useCompany: vi.fn() }));

const summaryMock = apiGetRequestContextSummary as any;
const activityMock = apiPanelService.getActivity as any;

const SUMMARY = {
  work: {
    total: 7,
    approvals: 2,
    warehouse: 4,
    warehouseApproval: 1,
    accounting: 3,
    accountingApproval: 2,
    accountingProfitRegistration: 1,
    managementApproval: 2,
  },
  dashboard: { pending: 7, inApproval: 5, completed: 3, returned: 2 },
};
const ACT = [{
  id: 'r1',
  requestNumber: '101',
  description: 'Motor eléctrico',
  status: 'BORRADOR',
  actor: 'Juan',
  createdAt: '2026-09-01T10:00:00.000Z',
}];

function mockCtx(permissions: string[]) {
  (useSession as any).mockReturnValue({
    user: { displayName: 'Juan' },
    hasPermission: (p: string) => permissions.includes(p),
  });
  (useCompany as any).mockReturnValue({ companyId: 'c1' });
}

describe('DashboardPage — contadores contextuales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx(['DASHBOARD.VIEW', 'REQUEST.VIEW', 'REQUEST.CREATE', 'WAREHOUSE.VIEW', 'WAREHOUSE_MANAGER.VIEW', 'ACCOUNTING.VIEW', 'MANAGER.APPROVE']);
    summaryMock.mockResolvedValue(structuredClone(SUMMARY));
    activityMock.mockResolvedValue(structuredClone(ACT));
  });
  afterEach(() => cleanup());

  it('tarjetas reales: Trabajo pendiente / En aprobación / Completadas / Devueltas', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByText('Resumen general');
    // "Trabajo pendiente" aparece en la tarjeta Y en la sección (diseño).
    expect(screen.getAllByText('Trabajo pendiente').length).toBeGreaterThanOrEqual(2);
    for (const label of ['En aprobación', 'Completadas', 'Devueltas']) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
    expect(screen.queryByText('Pendientes de atención')).toBeNull();
    expect(screen.getByText('7')).toBeTruthy(); // pending
    expect(screen.getByText('5')).toBeTruthy(); // inApproval
    expect(screen.getByText('3')).toBeTruthy(); // completed
    expect(screen.getByText('2')).toBeTruthy(); // returned
    expect(summaryMock).toHaveBeenCalledTimes(1);
  });

  it('Trabajo pendiente reutiliza el MISMO resumen que el menú (sin N requests por badge)', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Trabajo pendiente' });
    // Una sola llamada al resumen consolidado.
    expect(summaryMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/4 pendientes/)).toBeTruthy(); // Almacén
    expect(screen.getByText(/1 pendiente$/)).toBeTruthy(); // Aprobación Almacén (singular)
    expect(screen.getByText(/3 pendientes/)).toBeTruthy(); // Contabilidad
    expect(screen.getByText(/2 pendientes/)).toBeTruthy(); // Aprobaciones
  });

  it('sin ACCOUNTING.VIEW no muestra la fila Contabilidad', async () => {
    mockCtx(['DASHBOARD.VIEW', 'WAREHOUSE.VIEW']);
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Trabajo pendiente' });
    expect(screen.queryByText('Contabilidad')).toBeNull();
    expect(screen.getByText('Almacén')).toBeTruthy();
    expect(screen.queryByText('Aprobaciones')).toBeNull();
  });

  it('error del resumen muestra estado de error con reintento (no números falsos)', async () => {
    summaryMock.mockRejectedValue(new Error('x'));
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText('No pudimos cargar los contadores del panel.')).toBeTruthy();
    expect(screen.getByText('Reintentar')).toBeTruthy();
    expect(screen.queryByText('Pendientes de atención')).toBeNull();
  });

  it('loading con skeleton antes del resumen', () => {
    summaryMock.mockReturnValue(new Promise(() => {}));
    activityMock.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(screen.getByText('Dashboard Gerencial')).toBeTruthy();
  });

  it('actividad compacta con estado y enlace a mis solicitudes', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText('#101')).toBeTruthy();
    expect(screen.getByText('Ver mis solicitudes')).toBeTruthy();
  });

  it('acciones rápidas según permisos', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByText('Acciones rápidas');
    expect(screen.getByText('Crear solicitud')).toBeTruthy();
    expect(screen.getByText('Mis solicitudes')).toBeTruthy();
  });

  it('usuario con pocos permisos: solo filas permitidas y mismos números del resumen', async () => {
    mockCtx(['DASHBOARD.VIEW']);
    summaryMock.mockResolvedValue({
      work: {
        total: 0,
        approvals: 0,
        warehouse: 0,
        warehouseApproval: 0,
        accounting: 0,
        accountingApproval: 0,
        accountingProfitRegistration: 0,
        managementApproval: 0,
      },
      dashboard: { pending: 0, inApproval: 1, completed: 0, returned: 0 },
    });
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Trabajo pendiente' });
    expect(screen.queryByText('Almacén')).toBeNull();
    expect(screen.queryByText('Contabilidad')).toBeNull();
    expect(screen.getByText('Sin pendientes')).toBeTruthy();
  });
});
