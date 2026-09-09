// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WarehouseList } from './AlmacenList';
import { useSession } from '../../contextos/SessionContext';

vi.mock('../../servicios', () => ({
  warehouseService: { getPendingRequests: vi.fn(), getRequestForClassification: vi.fn() },
}));
vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));
vi.mock('../../contextos/CompanyContext', () => ({ useCompany: () => ({ companyId: 'c1' }) }));
vi.mock('../../hooks/useOrganizacion', () => ({
  useOrganizacion: () => ({
    usuarios: [{ id: 'u1', displayName: 'Juan Pérez' }],
    departamentos: [{ id: 'd1', name: 'Mantenimiento' }],
  }),
}));

import { warehouseService } from '../../servicios';
const pendingMock = warehouseService.getPendingRequests as any;

const REQ: any = {
  id: 'r1', requestNumber: 7, requestedDescription: 'TORNILLO HEX',
  requesterId: 'u1', departmentId: 'd1', status: 'PENDIENTE_ALMACEN', priority: 1,
  createdAt: '2026-09-01T10:00:00.000Z',
};

describe('AlmacenList 11C', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSession as any).mockReturnValue({ hasPermission: () => true });
    pendingMock.mockResolvedValue([structuredClone(REQ)]);
  });
  afterEach(() => cleanup());

  it('bandeja con conteo y columnas operativas', async () => {
    render(<MemoryRouter><WarehouseList /></MemoryRouter>);
    expect(await screen.findByText(/1 solicitud por clasificar/)).toBeTruthy();
    expect(screen.getByText('TORNILLO HEX')).toBeTruthy();
    expect(screen.getByText('Juan Pérez')).toBeTruthy();
    expect(screen.getByText('Clasificar')).toBeTruthy();
  });

  it('loading, error con reintento y empty', async () => {
    render(<MemoryRouter><WarehouseList /></MemoryRouter>);
    expect(screen.getByLabelText('Cargando solicitudes')).toBeTruthy();
    expect(await screen.findByText('TORNILLO HEX')).toBeTruthy();
    cleanup();
    pendingMock.mockRejectedValueOnce(new Error('x'));
    render(<MemoryRouter><WarehouseList /></MemoryRouter>);
    expect(await screen.findByText('No pudimos cargar las solicitudes pendientes.')).toBeTruthy();
    cleanup();
    pendingMock.mockResolvedValueOnce([]);
    render(<MemoryRouter><WarehouseList /></MemoryRouter>);
    expect(await screen.findByText('No hay solicitudes pendientes')).toBeTruthy();
  });

  it('botón Clasificar respeta WAREHOUSE.CLASSIFY', async () => {
    (useSession as any).mockReturnValue({ hasPermission: (p: string) => p !== 'WAREHOUSE.CLASSIFY' });
    render(<MemoryRouter><WarehouseList /></MemoryRouter>);
    expect(await screen.findByText('TORNILLO HEX')).toBeTruthy();
    expect(screen.queryByText('Clasificar')).toBeNull();
  });
});
