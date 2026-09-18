// @vitest-environment jsdom
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WarehouseClassify } from './AlmacenClassify';

const GROUPS = [
  { co_lin: 'RVH', lin_des: 'REPUESTOS' },
  { co_lin: 'MEC', lin_des: 'MECANICO' },
];
const SUBGROUPS = [
  { co_lin: 'RVH', co_subl: 'CAR', subl_des: 'CARROCERIA' },
  { co_lin: 'RVH', co_subl: 'MOT', subl_des: 'MOTOR' },
  { co_lin: 'MEC', co_subl: 'ROD', subl_des: 'RODAMIENTO' },
];
const CATEGORIES = [{ co_cat: '002', cat_des: 'ARTICULOS DE OFICINA' }];
const BRANDS = [{ co_col: '01', des_col: 'NO APLICA' }];
const TIPOS = [
  { code: 'C', label: 'Consumo', functional: true, usageCount: 10 },
  { code: 'S', label: 'Servicio', functional: true, usageCount: 5 },
  { code: 'V', label: 'Venta', functional: true, usageCount: 3 },
  { code: 'F', label: 'Reservado F', functional: false, usageCount: 0 },
];
const TASAS = [{ tipo: '1', descripcio: 'TASA GENERAL' }, { tipo: '6', descripcio: 'EXENTOS' }];
const P_UNIDADES = [{ co_uni: 'UND', des_uni: 'UNIDAD' }];

const mockGetRequest = vi.fn();
const mockValidate = vi.fn();
const mockSave = vi.fn();
const mockApprove = vi.fn();
const mockAuditEvents = vi.fn();

// AlmacenClassify ya no consume SessionContext (10E).

vi.mock('../../servicios', () => ({
  warehouseService: {
    getRequestForClassification: (...args: unknown[]) => mockGetRequest(...args),
    saveClassification: (...args: unknown[]) => mockSave(...args),
    approveClassification: (...args: unknown[]) => mockApprove(...args),
    returnRequest: vi.fn(),
    validateArticle: (...args: unknown[]) => mockValidate(...args),
  },
  auditService: {
    getEvents: (...args: unknown[]) => mockAuditEvents(...args),
  },
}));

const mockAnalizar = vi.fn();
vi.mock('../../servicios/api/api-matching-service', () => ({
  apiMatchingService: {
    analizar: (...args: unknown[]) => mockAnalizar(...args),
    vincular: vi.fn(),
  },
}));

const { LOCAL_CATALOGS } = vi.hoisted(() => ({
  LOCAL_CATALOGS: {
    grupos: [], subgrupos: [], categorias: [], marcas: [],
    unidades: [{ id: 'uom1', code: 'PZA', name: 'Pieza' }],
    loading: false, error: null,
  },
}));

vi.mock('../../hooks/useCatalogos', () => ({
  // Referencialmente estable como el hook real (una sola carga).
  useCatalogos: () => LOCAL_CATALOGS,
}));

// Can y edición evalúan permiso × estado: en tests se controla el permiso.
const { sessionAllow } = vi.hoisted(() => ({ sessionAllow: { value: true } }));

vi.mock('../../contextos/SessionContext', () => ({
  useSession: () => ({ hasPermission: () => sessionAllow.value, loading: false, authenticated: true }),
}));
vi.mock('../../contextos/CompanyContext', () => ({ useCompany: () => ({ companyId: 'c1' }) }));
vi.mock('../../hooks/useOrganizacion', () => ({
  useOrganizacion: () => ({
    usuarios: [{ id: 'u9', displayName: 'Carlos Almacén' }],
    departamentos: [{ id: 'd1', name: 'Mantenimiento' }],
  }),
}));

const { hookCalls } = vi.hoisted(() => ({ hookCalls: [] as (string | undefined)[] }));

vi.mock('../../hooks/useProfitCatalogos', () => ({
  // Imita al backend: subgrupos ya filtrados por grupo (co_lin).
  useProfitCatalogos: (groupCode?: string) => {
    hookCalls.push(groupCode);
    return {
      grupos: GROUPS,
      subgrupos: groupCode ? SUBGROUPS.filter(s => s.co_lin === groupCode) : SUBGROUPS,
      categorias: CATEGORIES,
      marcas: BRANDS,
      tipos: TIPOS,
      tasas: TASAS,
      unidadesProfit: P_UNIDADES,
      defaultType: groupCode === 'RVH' ? 'C' : null,
      loading: false,
      error: null,
    };
  },
}));

const REQUEST: any = {
  id: 'r1', requestNumber: 'REQ-0001', status: 'PENDIENTE_ALMACEN',
  requestedDescription: 'TORNILLO', purpose: 'x', requesterId: 'u1',
  departmentId: 'd1', companyId: 'c1', priority: 0,
  createdAt: '', updatedAt: '',
};

function renderClassify() {
  return render(
    <MemoryRouter initialEntries={['/warehouse/r1']}>
      <Routes>
        <Route path="/warehouse" element={<div />} />
        <Route path="/warehouse/:id" element={<WarehouseClassify />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AlmacenClassify con catálogos Profit (FASE 8F)', () => {
  beforeEach(() => {
    sessionAllow.value = true;
    mockGetRequest.mockResolvedValue(REQUEST);
    mockAuditEvents.mockResolvedValue({ data: [], total: 0 });
  });

  afterEach(() => {
    cleanup();
  });

  it('8. cambiar de grupo invalida el subgrupo anterior y filtra por grupo', async () => {
    renderClassify();

    const groupSel = await screen.findByLabelText(/Grupo \(Profit\)/i, { selector: 'select' }) as HTMLSelectElement;
    const subgroupSel = screen.getByLabelText(/Subgrupo/i) as HTMLSelectElement;

    // Sin grupo: subgrupo deshabilitado
    expect(subgroupSel.disabled).toBe(true);

    // Selecciona RVH → solo subgrupos de RVH
    fireEvent.change(groupSel, { target: { value: 'RVH' } });
    await waitFor(() => expect(
      (screen.getByLabelText(/Subgrupo/i) as HTMLSelectElement).disabled,
    ).toBe(false));
    expect(hookCalls[hookCalls.length - 1]).toBe('RVH');
    const rvOptions = Array.from(
      (screen.getByLabelText(/Subgrupo/i) as HTMLSelectElement).querySelectorAll('option'),
    ).map(o => o.value);
    expect(rvOptions).toContain('CAR');
    expect(rvOptions).toContain('MOT');
    expect(rvOptions).not.toContain('ROD');

    // Elige CAR y cambia de grupo a MEC → subgrupo se resetea y filtra por MEC
    fireEvent.change(subgroupSel, { target: { value: 'CAR' } });
    expect((screen.getByLabelText(/Subgrupo/i) as HTMLSelectElement).value).toBe('CAR');
    fireEvent.change(groupSel, { target: { value: 'MEC' } });
    await waitFor(() => {
      expect((screen.getByLabelText(/Subgrupo/i) as HTMLSelectElement).value).toBe('');
    });
    const mecOptions = Array.from(
      (screen.getByLabelText(/Subgrupo/i) as HTMLSelectElement).querySelectorAll('option'),
    ).map(o => o.value);
    expect(mecOptions).toContain('ROD');
    expect(mecOptions).not.toContain('CAR');
  });

  it('categoría y marca son independientes del grupo', async () => {
    renderClassify();
    const catSel = await screen.findByLabelText(/Categoría \(Profit/i) as HTMLSelectElement;
    const brandSel = screen.getByLabelText(/Marca \(Profit/i) as HTMLSelectElement;
    expect(catSel.disabled).toBe(false);
    expect(brandSel.disabled).toBe(false);
    expect(Array.from(catSel.querySelectorAll('option')).map(o => o.value)).toContain('002');
    expect(Array.from(brandSel.querySelectorAll('option')).map(o => o.value)).toContain('01');
  });
});

describe('AlmacenClassify 14C-FORM: tipo, unidad Profit, impuesto, dry-run', () => {
  beforeEach(() => {
    sessionAllow.value = true;
    mockGetRequest.mockResolvedValue(REQUEST);
    mockValidate.mockResolvedValue({ ready: true, checks: [], warnings: [], wouldProvision: [] });
    mockAuditEvents.mockResolvedValue({ data: [], total: 0 });
  });

  afterEach(() => {
    cleanup();
  });

  it('tipo viene de Profit (sin MP) y el grupo preselecciona el default', async () => {
    renderClassify();
    const typeSel = await screen.findByLabelText(/Tipo de art/i) as HTMLSelectElement;
    const values = Array.from(typeSel.querySelectorAll('option')).map(o => o.value);
    expect(values).toContain('C');
    expect(values).toContain('S');
    expect(values).toContain('V');
    expect(values).not.toContain('MP');

    // Sin grupo no hay default
    expect(typeSel.value).toBe('');
    fireEvent.change(screen.getByLabelText(/Grupo \(Profit\)/i, { selector: 'select' }), { target: { value: 'RVH' } });
    await waitFor(() => expect(
      (screen.getByLabelText(/Tipo de art/i) as HTMLSelectElement).value,
    ).toBe('C'));
  });

  it('override manual del tipo se conserva al cambiar de grupo', async () => {
    renderClassify();
    const groupSel = await screen.findByLabelText(/Grupo \(Profit\)/i, { selector: 'select' });
    fireEvent.change(groupSel, { target: { value: 'RVH' } });
    const typeSel = await screen.findByLabelText(/Tipo de art/i) as HTMLSelectElement;
    await waitFor(() => expect(typeSel.value).toBe('C'));

    // Override manual a V
    fireEvent.change(typeSel, { target: { value: 'V' } });
    await screen.findByText(/seleccionado manualmente/i);

    // Cambia de grupo: se conserva V
    fireEvent.change(groupSel, { target: { value: 'MEC' } });
    await waitFor(() => {
      expect((screen.getByLabelText(/Tipo de art/i) as HTMLSelectElement).value).toBe('V');
    });
  });

  it('unidad Profit es requerida y el impuesto se deriva del tipo', async () => {
    renderClassify();
    const unitSel = await screen.findByLabelText(/Unidad de venta/i) as HTMLSelectElement;
    expect(Array.from(unitSel.querySelectorAll('option')).map(o => o.value)).toContain('UND');

    fireEvent.change(screen.getByLabelText(/Grupo \(Profit\)/i, { selector: 'select' }), { target: { value: 'RVH' } });
    await waitFor(() => expect(
      (screen.getByLabelText(/Tipo de art/i) as HTMLSelectElement).value,
    ).toBe('C'));
    // C deriva tasa 1
    await screen.findByText(/tasa 1/i);
  });

  it('botón Validar artículo ejecuta el Analizador manualmente', async () => {
    mockAnalizar.mockResolvedValue({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    renderClassify();
    await screen.findByLabelText(/Grupo \(Profit\)/i, { selector: 'select' });
    fireEvent.click(screen.getByRole('button', { name: /Validar art/i }));
    await waitFor(() => expect(mockAnalizar).toHaveBeenCalled());
    const last = mockAnalizar.mock.calls[mockAnalizar.mock.calls.length - 1]!;
    expect(last[0]).toBe('r1');
    expect(await screen.findByText('✓ Validación completada')).toBeTruthy();
  });
});

describe('AlmacenClassify vista post-clasificación (solo lectura por estado)', () => {
  const CLASSIFIED: any = {
    ...REQUEST,
    status: 'ALMACEN_APROBADO',
    partNumber: 'P-001',
    application: 'Bomba hidráulica',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionAllow.value = true;
    mockValidate.mockResolvedValue({ ready: true, checks: [], warnings: [], wouldProvision: [] });
    mockSave.mockResolvedValue({});
    mockApprove.mockResolvedValue({});
    mockAuditEvents.mockResolvedValue({
      data: [{ actorId: 'u9', action: 'CLASSIFIED', createdAt: '2026-09-01T10:00:00.000Z' }],
      total: 1,
    });
  });

  afterEach(() => {
    cleanup();
  });

  function renderWithStatus(status: string) {
    mockGetRequest.mockResolvedValue({ ...CLASSIFIED, status });
    renderClassify();
  }

  it('1. PENDIENTE_ALMACEN renderiza formulario editable', async () => {
    mockGetRequest.mockResolvedValue(REQUEST);
    renderClassify();
    const groupSel = await screen.findByLabelText(/Grupo \(Profit\)/i, { selector: 'select' }) as HTMLSelectElement;
    expect(groupSel.disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Guardar Borrador' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Validar art/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aprobar Clasificación' })).toBeTruthy();
    expect(screen.queryByText(/Clasificación enviada/)).toBeNull();
  });

  it('2/3/4. ALMACEN_APROBADO bloquea campos y oculta acciones de edición', async () => {
    renderWithStatus('ALMACEN_APROBADO');
    const groupSel = await screen.findByLabelText(/Grupo \(Profit\)/i, { selector: 'select' }) as HTMLSelectElement;
    expect(groupSel.disabled).toBe(true);
    expect((screen.getByLabelText(/Tipo de art/i) as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Unidad de venta/i) as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Aprobar Clasificación' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Guardar Borrador' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Validar art/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Devolver' })).toBeNull();
    expect(mockSave).not.toHaveBeenCalled();
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it('5. ALMACEN_APROBADO muestra mensaje de pendiente y datos clasificados', async () => {
    renderWithStatus('ALMACEN_APROBADO');
    expect(await screen.findByText(/Clasificación enviada/)).toBeTruthy();
    expect(screen.getAllByText(/pendiente de aprobación del Encargado de Almacén/).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText(/Clasificada por: Carlos Almacén/)).toBeTruthy();
    // Datos visibles de solo lectura.
    expect(screen.getAllByText('TORNILLO').length).toBeGreaterThanOrEqual(1);
    expect((screen.getByPlaceholderText('Part Number') as HTMLInputElement).value).toBe('P-001');
    expect((screen.getByPlaceholderText('Part Number') as HTMLInputElement).disabled).toBe(true);
  });

  it('6. recarga con ALMACEN_APROBADO mantiene modo solo lectura', async () => {
    renderWithStatus('ALMACEN_APROBADO');
    await screen.findByText(/Clasificación enviada/);
    cleanup();
    // F5: montaje nuevo, estado real desde API.
    renderWithStatus('ALMACEN_APROBADO');
    expect(await screen.findByText(/Clasificación enviada/)).toBeTruthy();
    expect((await screen.findByLabelText(/Grupo \(Profit\)/i, { selector: 'select' }) as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Aprobar Clasificación' })).toBeNull();
  });

  it.each([
    ['PENDIENTE_CONTABILIDAD'],
    ['CONTABILIDAD_APROBADA'],
    ['INSERTADO_PROFIT'],
  ])('7/8/9. %s no permite editar', async (status) => {
    renderWithStatus(status);
    expect(await screen.findByText(/Clasificación enviada/)).toBeTruthy();
    expect((await screen.findByLabelText(/Grupo \(Profit\)/i, { selector: 'select' }) as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Guardar Borrador' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aprobar Clasificación' })).toBeNull();
  });

  it('10. usuario sin permiso no obtiene controles de edición en PENDIENTE_ALMACEN', async () => {
    sessionAllow.value = false;
    mockGetRequest.mockResolvedValue(REQUEST);
    renderClassify();
    expect((await screen.findByLabelText(/Grupo \(Profit\)/i, { selector: 'select' }) as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Guardar Borrador' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aprobar Clasificación' })).toBeNull();
  });

  it('borrador: guardar conserva PENDIENTE_ALMACEN, avisa y sigue editable', async () => {
    mockGetRequest.mockResolvedValue(REQUEST);
    renderClassify();
    await screen.findByLabelText(/Grupo \(Profit\)/i, { selector: 'select' });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Borrador' }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Borrador guardado correctamente/)).toBeTruthy();
    expect(screen.getByText(/continúa pendiente en Almacén/)).toBeTruthy();
    // Sigue editable: sin banner de enviada y con acciones visibles.
    // (el botón pasa a "Guardar Borrador ✓", prueba de que el guardado completó).
    expect(screen.queryByText(/Clasificación enviada/)).toBeNull();
    expect((screen.getByLabelText(/Grupo \(Profit\)/i, { selector: 'select' }) as HTMLSelectElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Guardar Borrador ✓' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aprobar Clasificación' })).toBeTruthy();
  });

  it('borrador: varios guardados parciales conservan lo anterior', async () => {
    mockGetRequest.mockResolvedValue(REQUEST);
    renderClassify();
    await screen.findByLabelText(/Grupo \(Profit\)/i, { selector: 'select' });
    const partInput = screen.getByPlaceholderText('Part Number') as HTMLInputElement;
    fireEvent.change(partInput, { target: { value: 'P-001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Borrador' }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0]![1]).toMatchObject({ partNumber: 'P-001' });
    const appInput = screen.getByPlaceholderText('Aplicación del artículo') as HTMLInputElement;
    fireEvent.change(appInput, { target: { value: 'Bomba' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Borrador ✓' }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
    // El segundo payload conserva el part number del primero (estado del formulario).
    expect(mockSave.mock.calls[1]![1]).toMatchObject({ partNumber: 'P-001', application: 'Bomba' });
    expect((screen.getByPlaceholderText('Part Number') as HTMLInputElement).value).toBe('P-001');
  });
});

describe('AlmacenClassify 23.2 SAME resuelto con artículo existente', () => {
  beforeEach(() => {
    sessionAllow.value = true;
    mockGetRequest.mockResolvedValue({
      ...REQUEST,
      articleLink: {
        companyCode: 'AD_TRANS', profitArticleCode: '094-7134-CAT',
        decision: 'SAME', decidedBy: 'u-alm',
      },
    });
    mockAnalizar.mockResolvedValue({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    mockAuditEvents.mockResolvedValue({ data: [], total: 0 });
  });

  afterEach(() => {
    cleanup();
  });

  it('muestra banner resuelto y oculta Aprobar Clasificación', async () => {
    renderClassify();
    await screen.findByLabelText(/Grupo \(Profit\)/i, { selector: 'select' });
    expect(await screen.findByText(/Solicitud resuelta con artículo existente/)).toBeTruthy();
    expect(screen.getByText(/094-7134-CAT/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aprobar Clasificación' })).toBeNull();
    // Guardar/Validar/Devolver siguen disponibles (no avanzan a creación).
    expect(screen.getByRole('button', { name: 'Guardar Borrador' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Validar art/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Devolver' })).toBeTruthy();
  });

  it('Validar artículo se deshabilita mientras el Analizador trabaja', async () => {
    let resolveRun!: (v: any) => void;
    mockAnalizar.mockImplementation(() => new Promise((res) => { resolveRun = res; }));
    renderClassify();
    await screen.findByLabelText(/Grupo \(Profit\)/i, { selector: 'select' });
    const btn = screen.getByRole('button', { name: /Validar art/i });
    fireEvent.click(btn);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Analizando...' })).toBeTruthy());
    resolveRun!({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Validar art/i })).toBeTruthy());
  });
});
