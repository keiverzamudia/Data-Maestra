// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequesterList } from './SolicitudesList';
import { RequestDetailPage } from './SolicitudDetailPage';
import { requestService } from '../../servicios';
import { useSession } from '../../contextos/SessionContext';
import { useCompany } from '../../contextos/CompanyContext';
import { useOrganizacion } from '../../hooks/useOrganizacion';

vi.mock('../../servicios', () => ({
  requestService: { list: vi.fn(), getById: vi.fn(), create: vi.fn(), submit: vi.fn(), resumen: vi.fn() },
}));
vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));
vi.mock('../../contextos/CompanyContext', () => ({ useCompany: vi.fn() }));
vi.mock('../../hooks/useOrganizacion', () => ({ useOrganizacion: vi.fn() }));
vi.mock('../../hooks/useCatalogos', () => ({
  useCatalogos: () => ({ grupos: [], subgrupos: [], categorias: [], marcas: [], unidades: [] }),
}));

const listMock = (requestService as any).list;
const resumenMock = (requestService as any).resumen;
const getByIdMock = (requestService as any).getById;

const REQ: any = {
  id: 'r1', requestNumber: 101, requesterId: 'u1', departmentId: 'd1',
  requestedDescription: 'Motor eléctrico 3HP', purpose: '', priority: 1,
  status: 'PENDIENTE_GERENTE', companyId: 'c1', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
};

const RESUMEN = { activas: 2, historial: 5, completadas: 3, rechazadas: 1, enProceso: 1 };

function mockCtx() {
  (useSession as any).mockReturnValue({ hasPermission: () => true, user: { id: 'u1' } });
  (useCompany as any).mockReturnValue({ companyId: 'c1', companies: [{ id: 'c1', name: 'Empresa A' }] });
  (useOrganizacion as any).mockReturnValue({
    usuarios: [{ id: 'u1', displayName: 'Juan Pérez' }],
    departamentos: [{ id: 'd1', name: 'Mantenimiento' }],
  });
}

describe('SolicitudesList 13A — activas e historial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx();
    listMock.mockResolvedValue({ data: [structuredClone(REQ)], total: 1, filteredTotal: 1, page: 1, limit: 25 });
    resumenMock.mockResolvedValue({ ...RESUMEN });
  });
  afterEach(() => cleanup());

  it('pestañas, resumen server-side y columnas', async () => {
    render(<MemoryRouter><RequesterList /></MemoryRouter>);
    expect(await screen.findByText('Solicitudes activas')).toBeTruthy();
    expect(screen.getByText('Historial')).toBeTruthy();
    expect(await screen.findByText('Motor eléctrico 3HP')).toBeTruthy();
    expect(within(screen.getByRole('table')).getByText('Juan Pérez')).toBeTruthy();
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ scope: 'activas', page: 1, limit: 25 }));
  });

  it('historial muestra Mi participación', async () => {
    listMock.mockResolvedValue({
      data: [{ ...structuredClone(REQ), status: 'PENDIENTE_CONTABILIDAD', miParticipacion: { accion: 'Aprobé', fecha: '2026-09-09T09:10:00.000Z' } }],
      total: 1, filteredTotal: 1, page: 1, limit: 25,
    });
    render(<MemoryRouter><RequesterList /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Historial'));
    expect(await screen.findByText(/Aprobé/)).toBeTruthy();
    expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'historial' }));
  });

  it('filtros bucket y búsqueda llegan al backend con scope', async () => {
    render(<MemoryRouter><RequesterList /></MemoryRouter>);
    await screen.findByText('Motor eléctrico 3HP');
    fireEvent.change(screen.getByLabelText('Filtrar por estado'), { target: { value: 'rechazadas' } });
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'activas', bucket: 'rechazadas' })));
  });

  it('loading, error con reintento y empty', async () => {
    render(<MemoryRouter><RequesterList /></MemoryRouter>);
    await screen.findByText('Motor eléctrico 3HP');
    cleanup();
    listMock.mockRejectedValueOnce(new Error('x'));
    render(<MemoryRouter><RequesterList /></MemoryRouter>);
    expect(await screen.findByText('No pudimos cargar las solicitudes.')).toBeTruthy();
    cleanup();
    listMock.mockResolvedValueOnce({ data: [], total: 0, filteredTotal: 0, page: 1, limit: 25 });
    render(<MemoryRouter><RequesterList /></MemoryRouter>);
    expect(await screen.findByText('Sin pendientes')).toBeTruthy();
  });
});

describe('SolicitudDetailPage 13A — seguimiento', () => {
  beforeEach(() => { vi.clearAllMocks(); mockCtx(); });
  afterEach(() => cleanup());

  function renderDetail() {
    render(
      <MemoryRouter initialEntries={['/requester/r1']}>
        <Routes><Route path="/requester/:id" element={<RequestDetailPage />} /></Routes>
      </MemoryRouter>,
    );
  }

  it('cabecera, responsable actual y recorrido con actores', async () => {
    getByIdMock.mockResolvedValue({
      ...structuredClone(REQ),
      status: 'PENDIENTE_CONTABILIDAD',
      approvals: [
        { id: 'a1', stepCode: 'PENDIENTE_GERENTE', actorId: 'u9', action: 'APPROVE', fromStatus: 'PENDIENTE_GERENTE', toStatus: 'PENDIENTE_ALMACEN', createdAt: '2026-09-09T09:10:00.000Z', actor: { id: 'u9', username: 'c.r', displayName: 'Carlos Rodríguez' } },
      ],
    });
    renderDetail();
    expect(await screen.findByText('Solicitud #101')).toBeTruthy();
    expect(screen.getByText('Carlos Rodríguez')).toBeTruthy();
    expect(screen.getByText('Cola de Contabilidad')).toBeTruthy();
    expect(screen.getByText('Recorrido')).toBeTruthy();
  });

  it('mi participación y solo lectura al transferir', async () => {
    getByIdMock.mockResolvedValue({
      ...structuredClone(REQ),
      requesterId: 'u9',
      status: 'PENDIENTE_CONTABILIDAD',
      approvals: [
        { id: 'a1', stepCode: 'PENDIENTE_GERENTE', actorId: 'u1', action: 'APPROVE', fromStatus: 'PENDIENTE_GERENTE', toStatus: 'PENDIENTE_ALMACEN', createdAt: '2026-09-09T09:10:00.000Z', actor: { id: 'u1', username: 'j.p', displayName: 'Juan Pérez' } },
      ],
    });
    (useSession as any).mockReturnValue({ hasPermission: () => true, user: { id: 'u1' } });
    renderDetail();
    expect(await screen.findByText('Mi participación')).toBeTruthy();
    expect(screen.getByText(/Aprobó por mí/)).toBeTruthy();
    expect(screen.getByText(/Solo lectura/)).toBeTruthy();
  });

  it('sin acceso muestra mensaje sin revelar existencia', async () => {
    getByIdMock.mockRejectedValue({ status: 404, message: 'x' });
    renderDetail();
    expect(await screen.findByText(/no tienes acceso/)).toBeTruthy();
  });
});
