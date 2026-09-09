// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequesterList } from './SolicitudesList';
import { RequestDetailPage } from './SolicitudDetailPage';
import { requestService } from '../../servicios';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';
import { useOrganizacion } from '../../hooks/useOrganizacion';

vi.mock('../../servicios', () => ({
  requestService: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), submit: vi.fn() },
}));
vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));
vi.mock('../../contextos/CompanyContext', () => ({ useCompany: vi.fn() }));
vi.mock('../../hooks/useOrganizacion', () => ({ useOrganizacion: vi.fn() }));
vi.mock('../../hooks/useCatalogos', () => ({
  useCatalogos: () => ({ grupos: [], subgrupos: [], categorias: [], marcas: [], unidades: [] }),
}));

const listMock = (requestService as any).list;
const getByIdMock = (requestService as any).getById;

const REQ = {
  id: 'r1', requestNumber: 101, requesterId: 'u1', departmentId: 'd1',
  requestedDescription: 'Motor eléctrico 3HP', purpose: '', priority: 1 as const,
  status: 'PENDIENTE_GERENTE' as const, companyId: 'c1', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
};

function mockCtx() {
  (useSession as any).mockReturnValue({ hasPermission: () => true });
  (useCompany as any).mockReturnValue({ companyId: 'c1' });
  (useOrganizacion as any).mockReturnValue({
    usuarios: [{ id: 'u1', displayName: 'Juan Pérez' }],
    departamentos: [{ id: 'd1', name: 'Mantenimiento' }],
  });
}

describe('SolicitudesList 11B', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx();
    listMock.mockResolvedValue({ data: [structuredClone(REQ)], total: 1 });
  });
  afterEach(() => cleanup());

  const settle = () => new Promise(r => setTimeout(r, 380));

  it('listado con columnas operativas y estados', async () => {
    render(<MemoryRouter><RequesterList /></MemoryRouter>);
    await settle();
    expect(await screen.findByText('Motor eléctrico 3HP')).toBeTruthy();
    expect(screen.getByText('Juan Pérez')).toBeTruthy();
    expect(screen.getByText('Mantenimiento')).toBeTruthy();
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'c1' }));
  });

  it('loading, error con reintento y empty', async () => {
    render(<MemoryRouter><RequesterList /></MemoryRouter>);
    await settle();
    await screen.findByText('Motor eléctrico 3HP');
    cleanup();
    listMock.mockRejectedValueOnce(new Error('x'));
    render(<MemoryRouter><RequesterList /></MemoryRouter>);
    await settle();
    expect(await screen.findByText('No pudimos cargar las solicitudes.')).toBeTruthy();
    cleanup();
    listMock.mockResolvedValueOnce({ data: [], total: 0 });
    render(<MemoryRouter><RequesterList /></MemoryRouter>);
    await settle();
    expect(await screen.findByText('No hay solicitudes para mostrar')).toBeTruthy();
  });

  it('filtro por estado llega al backend', async () => {
    render(<MemoryRouter><RequesterList /></MemoryRouter>);
    await settle();
    await screen.findByText('Motor eléctrico 3HP');
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'RECHAZADO' } });
    await settle();
    expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'RECHAZADO' }));
  });
});

describe('SolicitudDetailPage 11B', () => {
  beforeEach(() => { vi.clearAllMocks(); mockCtx(); });
  afterEach(() => cleanup());

  it('cabecera con workflow y contexto', async () => {
    getByIdMock.mockResolvedValue(structuredClone(REQ));
    render(
      <MemoryRouter initialEntries={['/requester/r1']}>
        <Routes><Route path="/requester/:id" element={<RequestDetailPage />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Solicitud #101')).toBeTruthy();
    expect(screen.getAllByText('Pendiente de aprobación').length).toBeGreaterThan(0);
    expect(getByIdMock).toHaveBeenCalled();
  });
});
