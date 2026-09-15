// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AprobacionAlmacenPage } from './AprobacionAlmacenPage';
import { warehouseApprovalService, auditService } from '../../servicios';
import { useSession } from '../../contextos/SessionContext';

vi.mock('../../servicios', () => ({
  warehouseApprovalService: {
    getPendingApprovals: vi.fn(),
    getApprovalDetail: vi.fn(),
    approveApproval: vi.fn(),
    returnApproval: vi.fn(),
    rejectApproval: vi.fn(),
  },
  auditService: { getEvents: vi.fn() },
}));
vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));
vi.mock('../../contextos/CompanyContext', () => ({ useCompany: () => ({ companyId: 'c1' }) }));
vi.mock('../../hooks/useOrganizacion', () => ({
  useOrganizacion: () => ({
    usuarios: [
      { id: 'u1', displayName: 'Juan Pérez' },
      { id: 'u9', displayName: 'Carlos Almacén' },
    ],
    departamentos: [{ id: 'd1', name: 'Mantenimiento' }],
  }),
}));
vi.mock('../../hooks/useCatalogos', () => ({
  useCatalogos: () => ({
    grupos: [{ id: 'g1', code: 'FER', name: 'FERRETERIA' }],
    subgrupos: [{ id: 's1', code: 'MIS', name: 'MISCELANEOS' }],
    categorias: [],
    marcas: [],
    unidades: [],
    loading: false,
    error: null,
  }),
}));

const pendingMock = warehouseApprovalService.getPendingApprovals as any;
const detailMock = warehouseApprovalService.getApprovalDetail as any;
const approveMock = warehouseApprovalService.approveApproval as any;
const returnMock = warehouseApprovalService.returnApproval as any;
const rejectMock = warehouseApprovalService.rejectApproval as any;
const auditMock = auditService.getEvents as any;

const REQ: any = {
  id: 'r1', requestNumber: 31, requestedDescription: 'FILTRO DE AIRE',
  requesterId: 'u1', departmentId: 'd1', status: 'ALMACEN_APROBADO', priority: 2,
  groupId: 'g1', subgroupId: 's1', masterCode: 'FERMIS-00001',
  createdAt: '2026-09-01T10:00:00.000Z', approvals: [],
};

describe('AprobacionAlmacenPage 15A', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSession as any).mockReturnValue({ hasPermission: () => true });
    pendingMock.mockResolvedValue([structuredClone(REQ)]);
    detailMock.mockImplementation(async (id: string) => structuredClone({ ...REQ, id }));
    auditMock.mockResolvedValue({ data: [], total: 0 });
  });
  afterEach(() => cleanup());

  it('bandeja con conteo y Revisar abre el detalle sin aprobar', async () => {
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    expect(await screen.findByText(/1 solicitud por aprobar/)).toBeTruthy();
    expect(screen.getByText('FERMIS-00001')).toBeTruthy();
    fireEvent.click(screen.getByText('Revisar'));
    expect(await screen.findByText('Aprobación Almacén — 31')).toBeTruthy();
    expect(approveMock).not.toHaveBeenCalled();
    expect(returnMock).not.toHaveBeenCalled();
    expect(rejectMock).not.toHaveBeenCalled();
  });

  it('detalle muestra clasificación, recorrido y aviso de pendiente', async () => {
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    expect(await screen.findByText(/pendiente de tu aprobación/)).toBeTruthy();
    expect(await screen.findByText('Recorrido')).toBeTruthy();
    expect(screen.getByText('Aprobar solicitud')).toBeTruthy();
  });

  it('aprobar pide confirmación con contexto y ejecuta la transición', async () => {
    approveMock.mockResolvedValue({});
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    fireEvent.click(await screen.findByText('Aprobar solicitud'));
    expect(await screen.findByText(/continuar a Contabilidad/)).toBeTruthy();
    const confirms = screen.getAllByText('Aprobar');
    fireEvent.click(confirms[confirms.length - 1]!);
    expect(approveMock).toHaveBeenCalledWith('r1');
    expect(await screen.findByText(/1 solicitud por aprobar/)).toBeTruthy();
  });

  it('devolver exige motivo y lo envía', async () => {
    returnMock.mockResolvedValue({});
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    fireEvent.click((await screen.findAllByText('Devolver'))[0]!);
    expect(await screen.findByText(/Indique el motivo/)).toBeTruthy();
    const btns = screen.getAllByText('Devolver');
    const btn = btns[btns.length - 1]!;
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Grupo incorrecto/), { target: { value: 'Grupo incorrecto' } });
    fireEvent.click(btn);
    expect(returnMock).toHaveBeenCalledWith('r1', 'Grupo incorrecto');
  });

  it('rechazar exige motivo y lo envía', async () => {
    rejectMock.mockResolvedValue({});
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    fireEvent.click(await screen.findByText('Rechazar'));
    expect(await screen.findByText(/El rechazo es definitivo/)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/duplicado/), { target: { value: 'Duplicado' } });
    const btns = screen.getAllByText('Rechazar');
    fireEvent.click(btns[btns.length - 1]!);
    expect(rejectMock).toHaveBeenCalledWith('r1', 'Duplicado');
  });

  it('sin permiso de aprobación no hay acciones en el detalle', async () => {
    (useSession as any).mockReturnValue({ hasPermission: () => false });
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    expect(await screen.findByText('Aprobación Almacén — 31')).toBeTruthy();
    expect(screen.queryByText('Aprobar solicitud')).toBeNull();
    expect(approveMock).not.toHaveBeenCalled();
  });

  it('loading, error y vacío', async () => {
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    expect(screen.getByLabelText('Cargando solicitudes')).toBeTruthy();
    expect(await screen.findByText('FILTRO DE AIRE')).toBeTruthy();
    cleanup();
    pendingMock.mockRejectedValueOnce(new Error('x'));
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    expect(await screen.findByText('No pudimos cargar las solicitudes.')).toBeTruthy();
    cleanup();
    pendingMock.mockResolvedValue([]);
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    expect(await screen.findByText('No hay solicitudes pendientes de aprobación')).toBeTruthy();
  });
});
