// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApprovalsPage } from './AprobacionesPage';
import { requestService } from '../../servicios';
import { useSession } from '../../contextos/SessionContext';

vi.mock('../../servicios', () => ({
  requestService: { list: vi.fn(), approve: vi.fn() },
}));
vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));
vi.mock('../../contextos/CompanyContext', () => ({ useCompany: () => ({ companyId: 'c1' }) }));
vi.mock('../../hooks/useOrganizacion', () => ({
  useOrganizacion: () => ({
    usuarios: [{ id: 'u1', displayName: 'Juan Pérez' }],
    departamentos: [{ id: 'd1', name: 'Mantenimiento' }],
  }),
}));

const listMock = (requestService as any).list;
const approveMock = (requestService as any).approve;

const REQ: any = {
  id: 'r1', requestNumber: 31, requestedDescription: 'FILTRO DE AIRE',
  requesterId: 'u1', departmentId: 'd1', status: 'PENDIENTE_GERENTE', priority: 2,
  createdAt: '2026-09-01T10:00:00.000Z',
};

describe('AprobacionesPage 11C', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSession as any).mockReturnValue({ hasPermission: () => true });
    listMock.mockResolvedValue({ data: [structuredClone(REQ)], total: 1 });
  });
  afterEach(() => cleanup());

  it('bandeja con conteo y detalle con workflow', async () => {
    render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    expect(await screen.findByText(/1 solicitud por aprobar/)).toBeTruthy();
    fireEvent.click(screen.getByText('Ver'));
    expect(await screen.findByText('Aprobación Gerencial — 31')).toBeTruthy();
  });

  it('aprobar con confirmación explícita', async () => {
    approveMock.mockResolvedValue({});
    render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Ver'));
    fireEvent.click(await screen.findByText('Aprobar solicitud'));
    expect(await screen.findByText(/Pasará a Almacén/)).toBeTruthy();
    const confirms = screen.getAllByText('Aprobar');
    fireEvent.click(confirms[confirms.length - 1]!);
    expect(approveMock).toHaveBeenCalledWith('r1');
  });

  it('loading y error', async () => {
    render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    expect(screen.getByLabelText('Cargando solicitudes')).toBeTruthy();
    expect(await screen.findByText('FILTRO DE AIRE')).toBeTruthy();
    cleanup();
    listMock.mockRejectedValueOnce(new Error('x'));
    render(<MemoryRouter><ApprovalsPage /></MemoryRouter>);
    expect(await screen.findByText('No pudimos cargar las solicitudes.')).toBeTruthy();
  });
});
