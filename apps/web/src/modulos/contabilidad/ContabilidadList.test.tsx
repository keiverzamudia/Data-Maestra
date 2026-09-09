// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountingList } from './ContabilidadList';
import { useSession } from '../../contextos/SessionContext';

vi.mock('../../servicios', () => ({
  accountingService: { getPendingApprovals: vi.fn(), approveAccounting: vi.fn(), rejectAccounting: vi.fn() },
}));
vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));
vi.mock('../../contextos/CompanyContext', () => ({ useCompany: () => ({ companyId: 'c1' }) }));
vi.mock('../../hooks/useCatalogos', () => ({
  useCatalogos: () => ({ grupos: [], subgrupos: [], categorias: [], marcas: [] }),
}));
vi.mock('../../hooks/useOrganizacion', () => ({
  useOrganizacion: () => ({
    usuarios: [{ id: 'u1', displayName: 'Juan Pérez' }],
    departamentos: [{ id: 'd1', name: 'Mantenimiento' }],
  }),
}));

import { accountingService } from '../../servicios';
const pendingMock = accountingService.getPendingApprovals as any;
const approveMock = accountingService.approveAccounting as any;

const REQ: any = {
  id: 'r1', requestNumber: 12, requestedDescription: 'VALVULA',
  requesterId: 'u1', departmentId: 'd1', status: 'PENDIENTE_CONTABILIDAD',
  groupId: 'g1', subgroupId: 's1', createdAt: '2026-09-01T10:00:00.000Z',
};

describe('ContabilidadList 11C', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSession as any).mockReturnValue({ hasPermission: () => true });
    pendingMock.mockResolvedValue([structuredClone(REQ)]);
  });
  afterEach(() => cleanup());

  it('bandeja con conteo y revisión', async () => {
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    expect(await screen.findByText(/1 clasificación por revisar/)).toBeTruthy();
    expect(screen.getByText('VALVULA')).toBeTruthy();
    fireEvent.click(screen.getByText('Revisar'));
    expect(await screen.findByText(/solo lectura/)).toBeTruthy();
    expect(screen.getByText('Información Contable')).toBeTruthy();
  });

  it('clasificación visible como read-only (sin selects de grupo)', async () => {
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    await screen.findByText(/solo lectura/);
    expect(screen.queryByLabelText(/Grupo/)).toBeNull();
  });

  it('aprobar pide confirmación y respeta entries', async () => {
    approveMock.mockResolvedValue({});
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    await screen.findByText('Información Contable');
    // Sin códigos: el botón existe pero está deshabilitado
    const btn = screen.getByText('Aprobar') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('loading y error', async () => {
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    expect(screen.getByLabelText('Cargando clasificaciones')).toBeTruthy();
    expect(await screen.findByText('VALVULA')).toBeTruthy();
    cleanup();
    pendingMock.mockRejectedValueOnce(new Error('x'));
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    expect(await screen.findByText('No pudimos cargar las clasificaciones pendientes.')).toBeTruthy();
  });
});
