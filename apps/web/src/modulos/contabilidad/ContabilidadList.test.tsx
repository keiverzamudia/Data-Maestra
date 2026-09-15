// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AccountingList } from './ContabilidadList';
import { useSession } from '../../contextos/SessionContext';

vi.mock('../../servicios', () => ({
  accountingService: { getPendingApprovals: vi.fn(), getAccountingDetail: vi.fn(), approveAccounting: vi.fn(), rejectAccounting: vi.fn() },
}));
vi.mock('../../contextos/SessionContext', () => ({ useSession: vi.fn() }));
vi.mock('../../contextos/CompanyContext', () => ({ useCompany: () => ({ companyId: 'c1' }) }));
vi.mock('../../hooks/useCatalogos', () => ({
  useCatalogos: () => ({
    grupos: [{ id: 'g1', code: 'FER', name: 'FERRETERIA' }],
    subgrupos: [{ id: 's1', code: 'MIS', name: 'MISCELANEOS' }],
    categorias: [],
    marcas: [],
    unidades: [],
  }),
}));
vi.mock('../../hooks/useOrganizacion', () => ({
  useOrganizacion: () => ({
    usuarios: [{ id: 'u1', displayName: 'Juan Pérez' }],
    departamentos: [{ id: 'd1', name: 'Mantenimiento' }],
  }),
}));
vi.mock('../../servicios/api/api-profit-service', () => ({
  apiProfitService: { getAccounts: vi.fn(), getGroupStandard: vi.fn() },
}));
vi.mock('../../servicios/api/api-profit-registration-service', () => ({
  apiProfitRegistrationService: {
    writeStatus: vi.fn(), plan: vi.fn(), create: vi.fn(),
    verify: vi.fn(), attempts: vi.fn(), retry: vi.fn(),
  },
  RECONCILE_LABELS: {
    CREATED_AND_VERIFIED: { text: 'Creado y verificado', tone: 'green' },
    CREATED_WITH_DIFFERENCES: { text: 'Creado con diferencias', tone: 'yellow' },
    NOT_FOUND: { text: 'No encontrado', tone: 'red' },
    RECONCILIATION_ERROR: { text: 'Error de reconciliación', tone: 'red' },
  },
  profitErrorLabel: (c?: string) => c ?? 'Error desconocido',
  profitErrorAction: () => null,
  profitOpState: (a: any) => {
    if (a.writeBlocked) return 'DISABLED';
    if (a.result) {
      if (a.result.ok && a.result.reconcile === 'CREATED_AND_VERIFIED') return 'SUCCESS';
      if (!a.result.ok && a.result.errorCode === 'ERROR_PROFIT_AMBIGUOUS') return 'UNKNOWN';
      if (!a.result.ok) return 'FAILED';
    }
    if (a.requestStatus === 'ERROR_PROFIT') return 'RETRY_REQUIRED';
    if (a.plan && a.plan.available) return 'READY_TO_WRITE';
    return 'READY';
  },
}));

import { accountingService } from '../../servicios';
import { apiProfitService } from '../../servicios/api/api-profit-service';
import { apiProfitRegistrationService } from '../../servicios/api/api-profit-registration-service';
const pendingMock = accountingService.getPendingApprovals as any;
const detailMock = accountingService.getAccountingDetail as any;
const approveMock = accountingService.approveAccounting as any;
const stdMock = apiProfitService.getGroupStandard as any;
const profitWriteStatusMock = apiProfitRegistrationService.writeStatus as any;
const profitAttemptsMock = apiProfitRegistrationService.attempts as any;

const REQ: any = {
  id: 'r1', requestNumber: 12, requestedDescription: 'VALVULA',
  requesterId: 'u1', departmentId: 'd1', status: 'PENDIENTE_CONTABILIDAD',
  groupId: 'g1', subgroupId: 's1', createdAt: '2026-09-01T10:00:00.000Z',
};

const APPROVALS: any[] = [
  { id: 'a1', stepCode: 'ALMACEN_APROBADO', actorId: 'u9', action: 'APPROVE', fromStatus: 'ALMACEN_APROBADO', toStatus: 'PENDIENTE_CONTABILIDAD', createdAt: '2026-09-02T10:00:00.000Z', actor: { id: 'u9', username: 'j.perez', displayName: 'JUAN PEREZ' } },
];

function mockDetail() {
  detailMock.mockResolvedValue(structuredClone({ ...REQ, approvals: APPROVALS }));
}

/** 16A — abre el detalle y cambia a la pestaña Contabilidad. */
async function openContabilidadTab() {
  fireEvent.click(await screen.findByText('Revisar'));
  expect((await screen.findAllByText(/Aprobación Contable — 12/)).length).toBeGreaterThanOrEqual(1);
  fireEvent.click(screen.getByRole('tab', { name: 'Contabilidad' }));
}

describe('ContabilidadList 11C', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSession as any).mockReturnValue({ hasPermission: () => true });
    pendingMock.mockResolvedValue([structuredClone(REQ)]);
    mockDetail();
    stdMock.mockResolvedValue({ groupCode: 'FER', configured: false, positions: [] });
  });
  afterEach(() => cleanup());

  it('bandeja con conteo y revisión', async () => {
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    expect(await screen.findByText(/1 clasificación por revisar/)).toBeTruthy();
    expect(screen.getByText('VALVULA')).toBeTruthy();
    fireEvent.click(screen.getByText('Revisar'));
    expect(await screen.findByText(/solo lectura/)).toBeTruthy();
    expect(screen.getAllByText(/Aprobación Contable — 12/).length).toBeGreaterThanOrEqual(1);
    // 16A — pestañas del workspace.
    expect(screen.getByRole('tab', { name: 'Información' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Contabilidad' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Registro en Profit/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Contabilidad' }));
    expect(screen.getByText('Información Contable Profit')).toBeTruthy();
  });

  it('clasificación visible como read-only (sin selects de grupo)', async () => {
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    await screen.findByText(/solo lectura/);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('aprobar pide confirmación y respeta entries', async () => {
    approveMock.mockResolvedValue({});
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    await openContabilidadTab();
    await screen.findByText('Información Contable Profit');
    // Sin códigos: los botones existen pero están deshabilitados
    const btns = screen.getAllByText(/Aprobar Solicitud/);
    expect(btns.length).toBeGreaterThanOrEqual(1);
    for (const b of btns) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('16A — aprobar habilita la pestaña Profit sin registrar automáticamente', async () => {
    approveMock.mockResolvedValue({});
    profitWriteStatusMock.mockResolvedValue({ enabled: false, configured: true, auth: 'sql', connected: true });
    profitAttemptsMock.mockResolvedValue({ requestId: 'r1', attempts: [], verifications: [] });
    detailMock
      .mockResolvedValueOnce(structuredClone({ ...REQ, masterCode: 'FERMIS-00001', approvals: APPROVALS }))
      .mockResolvedValue(structuredClone({
        ...REQ, status: 'CONTABILIDAD_APROBADA', masterCode: 'FERMIS-00001', approvals: APPROVALS,
      }));
    stdMock.mockResolvedValue({
      groupCode: 'FER', configured: true,
      positions: [{ position: 'c1', code: '1.1.04.03.01.006', description: 'Inventario', inCatalog: true }],
    });
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    await openContabilidadTab();
    const btn = screen.getAllByText(/Aprobar Solicitud/)[0] as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(await screen.findByText(/No se registrará en Profit automáticamente/)).toBeTruthy();
    const confirms = screen.getAllByText('Aprobar');
    fireEvent.click(confirms[confirms.length - 1]!);
    expect(approveMock).toHaveBeenCalledTimes(1);
    // El workspace sigue abierto y la pestaña Profit deja de estar bloqueada.
    expect(await screen.findByRole('tab', { name: 'Registro en Profit' })).toBeTruthy();
    expect(screen.getAllByText(/Aprobación Contable — 12/).length).toBeGreaterThanOrEqual(1);
  });

  it('16A — pestaña Profit bloqueada antes de aprobar', async () => {
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    fireEvent.click(await screen.findByText('Revisar'));
    expect((await screen.findAllByText(/Aprobación Contable — 12/)).length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole('tab', { name: /Registro en Profit/ }));
    expect(await screen.findByText(/registro en profit bloqueado/i)).toBeTruthy();
    expect(screen.getByText(/después de la aprobación de Contabilidad/)).toBeTruthy();
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

describe('ContabilidadList 12C — estándar de grupo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSession as any).mockReturnValue({ hasPermission: () => true });
    pendingMock.mockResolvedValue([structuredClone(REQ)]);
    mockDetail();
  });
  afterEach(() => cleanup());

  const STD = {
    groupCode: 'FER',
    configured: true,
    positions: [
      { position: 'c1', code: '1.1.04.03.01.006', description: 'Inventario', inCatalog: true },
      { position: 'c7', code: '1.1.04.01.01.001', description: 'Tránsito', inCatalog: true },
    ],
  };

  it('autocarga posiciones del estándar y habilita aprobar', async () => {
    detailMock.mockResolvedValue(structuredClone({ ...REQ, masterCode: 'FERMIS-00001', approvals: APPROVALS }));
    stdMock.mockResolvedValue(structuredClone(STD));
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    await openContabilidadTab();
    expect(await screen.findByText(/Sincronizado desde Profit/)).toBeTruthy();
    expect(screen.getByText('Posición')).toBeTruthy();
    expect(screen.getByText('Cuenta contable')).toBeTruthy();
    expect(screen.getByText(/Última verificación:/)).toBeTruthy();
    expect(stdMock).toHaveBeenCalledWith('FER');
    expect(screen.getByText('1.1.04.03.01.006')).toBeTruthy();
    // Sin selector de posiciones ni edición manual (el workspace sí tiene tablist propia)
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(/Puede cambiarla/)).toBeNull();
    expect(screen.queryByText('Quitar cuenta')).toBeNull();
    const btn = screen.getAllByText(/Aprobar Solicitud/)[0] as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('grupo sin estándar bloquea y ofrece verificar nuevamente', async () => {
    stdMock.mockResolvedValue({ groupCode: 'FER', configured: false, positions: [] });
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    await openContabilidadTab();
    expect(await screen.findByText(/Información contable no configurada/)).toBeTruthy();
    const btn = screen.getAllByText(/Aprobar Solicitud/)[0] as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    // Verificar nuevamente vuelve a consultar Profit en vivo
    stdMock.mockResolvedValue(structuredClone(STD));
    fireEvent.click(screen.getByRole('button', { name: /Verificar/ }));
    expect(await screen.findByText(/Sincronizado desde Profit/)).toBeTruthy();
    expect(stdMock).toHaveBeenCalledTimes(2);
  });

  it('error de Profit muestra reintento sin bloquear con mensaje de red', async () => {
    stdMock.mockRejectedValue(new Error('timeout Profit'));
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    await openContabilidadTab();
    expect(await screen.findByText(/No se pudo verificar Profit/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Intentar nuevamente/ })).toBeTruthy();
  });
});

describe('ContabilidadList 12E — checklist y trazabilidad', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSession as any).mockReturnValue({ hasPermission: () => true });
    pendingMock.mockResolvedValue([structuredClone(REQ)]);
    mockDetail();
  });
  afterEach(() => cleanup());

  const STD3 = {
    groupCode: 'FER',
    configured: true,
    positions: [{ position: 'c1', code: '1.1.04.03.01.006', description: 'Inventario', inCatalog: true }],
  };

  it('checklist completo permite aprobar y muestra trazabilidad de Almacén', async () => {
    detailMock.mockResolvedValue(structuredClone({ ...REQ, masterCode: 'FERMIS-00001', approvals: APPROVALS }));
    stdMock.mockResolvedValue(structuredClone(STD3));
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    await openContabilidadTab();
    expect(await screen.findByText('Checklist de Validación')).toBeTruthy();
    expect(screen.getByText(/Solicitud lista para aprobación contable/)).toBeTruthy();
    const btn = screen.getAllByText(/Aprobar Solicitud/)[0] as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    // 16A — la trazabilidad vive en la pestaña Información.
    fireEvent.click(screen.getByRole('tab', { name: 'Información' }));
    expect(await screen.findByText((_, el) => el?.textContent === 'Por: JUAN PEREZ')).toBeTruthy();
    expect(screen.getAllByText(/Aprobación Almacén/).length).toBeGreaterThanOrEqual(1);
  });

  it('checklist incompleto bloquea aprobar (sin código master)', async () => {
    stdMock.mockResolvedValue(structuredClone(STD3));
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    await openContabilidadTab();
    expect(await screen.findByText('Checklist de Validación')).toBeTruthy();
    expect(screen.getByText(/Faltan 1 requisitos/)).toBeTruthy();
    const btn = screen.getAllByText(/Aprobar Solicitud/)[0] as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('cada requisito muestra valor y expande verificación/origen', async () => {
    detailMock.mockResolvedValue(structuredClone({ ...REQ, masterCode: 'FERMIS-00001', approvals: APPROVALS }));
    stdMock.mockResolvedValue(structuredClone(STD3));
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    await openContabilidadTab();
    await screen.findByText('Checklist de Validación');
    // Valor compacto visible sin expandir
    expect(screen.getAllByText(/FERRETERIA/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('FERMIS-00001').length).toBeGreaterThanOrEqual(1);
    // Expandir evidencia del estándar
    const toggles = screen.getAllByText('Verificación');
    fireEvent.click(toggles[3]!);
    expect(await screen.findByText(/Profit contiene un estándar contable/)).toBeTruthy();
    expect(screen.getByText(/lin_art\.dis_cen/)).toBeTruthy();
  });

  it('Profit caído muestra ERROR no verde y Profit vacío muestra BLOQUEADO', async () => {
    stdMock.mockRejectedValue(new Error('timeout'));
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    await openContabilidadTab();
    await screen.findByText('Checklist de Validación');
    expect(screen.getAllByText('ERROR')).toHaveLength(2);
    // Grupo/Subgrupo no dependen de Profit: siguen completos (Master falta en el fixture)
    expect(screen.getAllByText('COMPLETO')).toHaveLength(2);
    cleanup();
    stdMock.mockResolvedValue({ groupCode: 'FER', configured: false, positions: [] });
    render(<MemoryRouter><AccountingList /></MemoryRouter>);
    await openContabilidadTab();
    await screen.findByText('Checklist de Validación');
    expect(await screen.findAllByText('BLOQUEADO')).toHaveLength(2);
  });
});
