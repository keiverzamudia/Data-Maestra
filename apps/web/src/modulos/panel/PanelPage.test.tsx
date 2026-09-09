// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './PanelPage';
import { apiPanelService } from '../../servicios/api/api-panel-service';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';

vi.mock('../../servicios/api/api-panel-service', () => ({
  apiPanelService: { getStats: vi.fn(), getActivity: vi.fn() },
}));
vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));
vi.mock('../../contextos/CompanyContext', () => ({ useCompany: vi.fn() }));

const statsMock = apiPanelService.getStats as any;
const activityMock = apiPanelService.getActivity as any;

const STATS = { pendingRequests: 3, inApproval: 2, returnedRequests: 0, completedRequests: 5, totalRequests: 10, recentImports: 1, activeMasterItems: 0, pendingHomologation: 0, pendingSourceItems: 0, pendingMatches: 0, qualityIssues: 0 };
const ACT = [{ id: 'r1', requestNumber: '101', description: 'Motor eléctrico', status: 'BORRADOR', actor: 'Juan', createdAt: '2026-09-01T10:00:00.000Z' }];

function mockCtx(permissions: string[]) {
  (useSession as any).mockReturnValue({ user: { displayName: 'Juan' }, hasPermission: (p: string) => permissions.includes(p) });
  (useCompany as any).mockReturnValue({ companyId: 'c1' });
}

describe('DashboardPage 11B', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx(['DASHBOARD.VIEW', 'REQUEST.VIEW', 'REQUEST.CREATE']);
    statsMock.mockResolvedValue({ ...STATS });
    activityMock.mockResolvedValue(structuredClone(ACT));
  });
  afterEach(() => cleanup());

  it('render normal con métricas reales y actividad', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText('Solicitudes Totales')).toBeTruthy();
    expect(screen.getByText('#101')).toBeTruthy();
    expect(screen.getByText('Crear solicitud')).toBeTruthy();
  });

  it('loading con skeleton', () => {
    statsMock.mockReturnValueOnce(new Promise(() => {}));
    activityMock.mockReturnValueOnce(new Promise(() => {}));
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(screen.getByText('Dashboard')).toBeTruthy();
  });

  it('error con reintento', async () => {
    statsMock.mockRejectedValueOnce(new Error('x'));
    activityMock.mockResolvedValueOnce([]);
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText('No pudimos cargar los datos del panel.')).toBeTruthy();
    expect(screen.getByText('Reintentar')).toBeTruthy();
  });

  it('empty sin actividad y acciones según permisos', async () => {
    activityMock.mockResolvedValueOnce([]);
    mockCtx(['DASHBOARD.VIEW']);
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText('Sin actividad reciente')).toBeTruthy();
    expect(screen.queryByText('Crear solicitud')).toBeNull();
  });
});
