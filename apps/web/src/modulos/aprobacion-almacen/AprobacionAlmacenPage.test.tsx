// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AprobacionAlmacenPage } from './AprobacionAlmacenPage';
import { warehouseApprovalService, auditService } from '../../servicios';
import { apiCatalogEffectiveService } from '../../servicios/api/api-catalog-effective-service';
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
vi.mock('../../servicios/api/api-catalog-effective-service', () => ({
  apiCatalogEffectiveService: { taxTypes: vi.fn(), articleTypes: vi.fn(), units: vi.fn() },
}));

const pendingMock = warehouseApprovalService.getPendingApprovals as any;
const detailMock = warehouseApprovalService.getApprovalDetail as any;
const approveMock = warehouseApprovalService.approveApproval as any;
const returnMock = warehouseApprovalService.returnApproval as any;
const rejectMock = warehouseApprovalService.rejectApproval as any;
const auditMock = auditService.getEvents as any;
const taxTypesMock = apiCatalogEffectiveService.taxTypes as any;
const articleTypesMock = apiCatalogEffectiveService.articleTypes as any;
const unitsMock = apiCatalogEffectiveService.units as any;

function envelope(items: Array<{ code: string; description: string }>): any {
  return {
    items: items.map(i => ({
      code: i.code, description: i.description, parentCode: '',
      visible: true, availableInProfit: true, isNew: false, synchronizedAt: null,
    })),
    total: items.length, mode: 'ALL', source: 'PROFIT_LIVE', synchronizedAt: null,
  };
}

const TAX_ENVELOPE: any = envelope([
  { code: '1', description: 'TASA GENERAL' },
  { code: '6', description: 'EXENTOS' },
]);
const TYPE_ENVELOPE: any = envelope([
  { code: 'C', description: 'CONSUMO' },
  { code: 'S', description: 'SERVICIO' },
]);
const UNIT_ENVELOPE: any = envelope([
  { code: 'UND', description: 'UNIDAD' },
  { code: '01', description: 'UNIDAD BASE' },
]);

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
    taxTypesMock.mockResolvedValue(structuredClone(TAX_ENVELOPE));
    articleTypesMock.mockResolvedValue(structuredClone(TYPE_ENVELOPE));
    unitsMock.mockResolvedValue(structuredClone(UNIT_ENVELOPE));
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

  it('muestra aviso cuando Almacén ajustó la descripción', async () => {
    const adjusted = { ...REQ, adjustedDescription: 'FILTRO DE AIRE CORTO' };
    pendingMock.mockResolvedValue([structuredClone(adjusted)]);
    detailMock.mockImplementation(async (id: string) => structuredClone({ ...adjusted, id }));
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    expect(await screen.findByText('Descripción ajustada por Almacén')).toBeTruthy();
    expect(screen.getByText('FILTRO DE AIRE CORTO')).toBeTruthy();
    expect(screen.getByText(/modificada durante la clasificación/)).toBeTruthy();
  });

  it('sin ajuste no muestra el aviso de descripción', async () => {
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    expect(await screen.findByText('Aprobación Almacén — 31')).toBeTruthy();
    expect(screen.getAllByText('FILTRO DE AIRE').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Descripción ajustada por Almacén')).toBeNull();
  });

  it('clasificación muestra nombre (código) de grupo y subgrupo', async () => {
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    expect(await screen.findByText('FERRETERIA (FER)')).toBeTruthy();
    expect(screen.getByText('MISCELANEOS (MIS)')).toBeTruthy();
  });

  it('impuesto muestra el nombre de la tasa, no solo el código', async () => {
    const withTax = { ...REQ, taxType: '1' };
    pendingMock.mockResolvedValue([structuredClone(withTax)]);
    detailMock.mockImplementation(async (id: string) => structuredClone({ ...withTax, id }));
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    expect(await screen.findByText('TASA GENERAL (1)')).toBeTruthy();
  });

  it('impuesto se oculta si Profit no responde', async () => {
    taxTypesMock.mockRejectedValueOnce(new Error('Profit caído'));
    const withTax = { ...REQ, taxType: '1' };
    pendingMock.mockResolvedValue([structuredClone(withTax)]);
    detailMock.mockImplementation(async (id: string) => structuredClone({ ...withTax, id }));
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    expect(await screen.findByText('FERRETERIA (FER)')).toBeTruthy();
    expect(screen.queryByText(/TASA GENERAL/)).toBeNull();
    expect(screen.queryByText('Impuesto (tipo_imp)')).toBeNull();
  });

  it('tipo y unidad muestran nombre (código), no solo el código', async () => {
    const full = { ...REQ, articleType: 'C', unitCode: 'UND', taxType: '1' };
    pendingMock.mockResolvedValue([structuredClone(full)]);
    detailMock.mockImplementation(async (id: string) => structuredClone({ ...full, id }));
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    expect(await screen.findByText('CONSUMO (C)')).toBeTruthy();
    expect(screen.getByText('UNIDAD (UND)')).toBeTruthy();
    expect(screen.getByText('TASA GENERAL (1)')).toBeTruthy();
  });

  it('tipo y unidad degradan al código si Profit no responde', async () => {
    articleTypesMock.mockRejectedValueOnce(new Error('Profit caído'));
    unitsMock.mockRejectedValueOnce(new Error('Profit caído'));
    taxTypesMock.mockRejectedValueOnce(new Error('Profit caído'));
    const full = { ...REQ, articleType: 'C', unitCode: '01' };
    pendingMock.mockResolvedValue([structuredClone(full)]);
    detailMock.mockImplementation(async (id: string) => structuredClone({ ...full, id }));
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    // Tipo cae al código crudo; unidad muestra el código guardado.
    expect(await screen.findByText(/^C$/)).toBeTruthy();
    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.queryByText(/CONSUMO/)).toBeNull();
  });

  it('confirmar aprobación incluye los códigos de grupo y subgrupo', async () => {
    approveMock.mockResolvedValue({});
    render(<MemoryRouter><AprobacionAlmacenPage /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    fireEvent.click(await screen.findByText('Aprobar solicitud'));
    expect(await screen.findByText(/Grupo: FERRETERIA \(FER\)/)).toBeTruthy();
    expect(screen.getByText(/Subgrupo: MISCELANEOS \(MIS\)/)).toBeTruthy();
  });
});
