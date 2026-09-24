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
  { code: 'F', label: 'Fabricación', functional: false, usageCount: 0 },
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

/** Abre el combobox y devuelve las etiquetas visibles. */
function comboLabels(input: HTMLElement): string[] {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '' } });
  return screen.getAllByRole('option').map(o => o.textContent ?? '');
}

/** Elige la opción cuya etiqueta contiene el texto. */
function pickOption(input: HTMLElement, labelPart: string) {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: '' } });
  const opt = screen.getAllByRole('option').find(o => (o.textContent ?? '').includes(labelPart));
  if (!opt) throw new Error(`opción no encontrada: ${labelPart}`);
  fireEvent.mouseDown(opt);
}

// FASE P2 — fase de la última llamada al Analizador (INICIAL/COMPLETA).
function analizarLastPhase(): string | undefined {
  const calls = mockAnalizar.mock.calls;
  if (calls.length === 0) return undefined;
  return (calls[calls.length - 1]![2] as { phase?: string } | undefined)?.phase;
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

    const groupInput = await screen.findByRole('combobox', { name: /Grupo \(Profit\)/i }) as HTMLInputElement;
    const subgroupInput = screen.getByRole('combobox', { name: /Subgrupo/i }) as HTMLInputElement;

    // Sin grupo: subgrupo deshabilitado
    expect(subgroupInput.disabled).toBe(true);

    // Selecciona RVH → solo subgrupos de RVH
    pickOption(groupInput, 'RVH');
    await waitFor(() => expect(
      (screen.getByRole('combobox', { name: /Subgrupo/i }) as HTMLInputElement).disabled,
    ).toBe(false));
    expect(hookCalls[hookCalls.length - 1]).toBe('RVH');
    const rvOptions = comboLabels(screen.getByRole('combobox', { name: /Subgrupo/i }));
    expect(rvOptions.some(l => l.includes('CAR'))).toBe(true);
    expect(rvOptions.some(l => l.includes('MOT'))).toBe(true);
    expect(rvOptions.some(l => l.includes('ROD'))).toBe(false);

    // Elige CAR y cambia de grupo a MEC → subgrupo se resetea y filtra por MEC
    pickOption(screen.getByRole('combobox', { name: /Subgrupo/i }), 'CAR');
    expect((screen.getByRole('combobox', { name: /Subgrupo/i }) as HTMLInputElement).value).toContain('CAR');
    // Cierra la lista abierta antes de operar otro campo
    fireEvent.keyDown(screen.getByRole('combobox', { name: /Subgrupo/i }), { key: 'Escape' });
    pickOption(groupInput, 'MEC');
    await waitFor(() => {
      expect((screen.getByRole('combobox', { name: /Subgrupo/i }) as HTMLInputElement).value).toBe('');
    });
    const mecOptions = comboLabels(screen.getByRole('combobox', { name: /Subgrupo/i }));
    expect(mecOptions.some(l => l.includes('ROD'))).toBe(true);
    expect(mecOptions.some(l => l.includes('CAR'))).toBe(false);
  });

  it('categoría y marca son independientes del grupo', async () => {
    renderClassify();
    const catInput = await screen.findByRole('combobox', { name: /Categoría \(Profit/i }) as HTMLInputElement;
    const brandInput = screen.getByRole('combobox', { name: /Marca \(Profit/i }) as HTMLInputElement;
    expect(catInput.disabled).toBe(false);
    expect(brandInput.disabled).toBe(false);
    expect(comboLabels(catInput).some(l => l.includes('002'))).toBe(true);
    expect(comboLabels(brandInput).some(l => l.includes('01'))).toBe(true);
  });

  it('el buscador filtra por código o descripción', async () => {
    renderClassify();
    const groupInput = await screen.findByRole('combobox', { name: /Grupo \(Profit\)/i }) as HTMLInputElement;
    fireEvent.focus(groupInput);
    fireEvent.change(groupInput, { target: { value: 'mecan' } });
    const labels = screen.getAllByRole('option').map(o => o.textContent ?? '');
    expect(labels.some(l => l.includes('MEC'))).toBe(true);
    expect(labels.some(l => l.includes('RVH'))).toBe(false);
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
    const typeInput = await screen.findByRole('combobox', { name: /Tipo de art/i }) as HTMLInputElement;
    const values = comboLabels(typeInput);
    expect(values.some(l => l.startsWith('C '))).toBe(true);
    expect(values.some(l => l.startsWith('S '))).toBe(true);
    expect(values.some(l => l.startsWith('V '))).toBe(true);
    expect(values.some(l => l.includes('MP'))).toBe(false);

    // Sin grupo no hay default
    expect(typeInput.value).toBe('');
    pickOption(screen.getByRole('combobox', { name: /Grupo \(Profit\)/i }), 'RVH');
    await waitFor(() => expect(
      (screen.getByRole('combobox', { name: /Tipo de art/i }) as HTMLInputElement).value,
    ).toContain('C —'));
  });

  it('override manual del tipo se conserva al cambiar de grupo', async () => {
    renderClassify();
    const groupInput = await screen.findByRole('combobox', { name: /Grupo \(Profit\)/i });
    pickOption(groupInput, 'RVH');
    const typeInput = await screen.findByRole('combobox', { name: /Tipo de art/i }) as HTMLInputElement;
    await waitFor(() => expect(typeInput.value).toContain('C —'));

    // Override manual a V
    pickOption(typeInput, 'V —');
    await screen.findByText(/seleccionado manualmente/i);

    // Cambia de grupo: se conserva V
    pickOption(groupInput, 'MEC');
    await waitFor(() => {
      expect((screen.getByRole('combobox', { name: /Tipo de art/i }) as HTMLInputElement).value).toContain('V —');
    });
  });

  it('unidad Profit es requerida y el grupo preselecciona el tipo', async () => {
    renderClassify();
    const unitInput = await screen.findByRole('combobox', { name: /Unidad de venta/i }) as HTMLInputElement;
    expect(comboLabels(unitInput).some(l => l.includes('UND'))).toBe(true);

    pickOption(screen.getByRole('combobox', { name: /Grupo \(Profit\)/i }), 'RVH');
    await waitFor(() => expect(
      (screen.getByRole('combobox', { name: /Tipo de art/i }) as HTMLInputElement).value,
    ).toContain('C —'));
    // El impuesto ya no vive en Almacén: no hay selector ni tasa derivada aquí.
    expect(screen.queryByText(/tasa 1/i)).toBeNull();
  });

  it('botón Validar artículo ejecuta el Analizador manualmente', async () => {
    mockAnalizar.mockResolvedValue({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    renderClassify();
    await screen.findByRole('combobox', { name: /Grupo \(Profit\)/i });
    // Espera a que la búsqueda automática (INICIAL) se haya lanzado.
    await waitFor(() => expect(mockAnalizar).toHaveBeenCalled(), { timeout: 3000 });
    // La clasificación está incompleta: el botón explica qué falta y no lanza
    // una comparación a medio llenar (FASE P2).
    fireEvent.click(screen.getByRole('button', { name: /Validar art/i }));
    expect(await screen.findByText(/Completa grupo, subgrupo/)).toBeTruthy();
    expect(mockAnalizar.mock.calls.every((c) => (c[2] as { phase?: string })?.phase === 'INICIAL')).toBe(true);
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
    const groupSel = await screen.findByRole('combobox', { name: /Grupo \(Profit\)/i }) as HTMLInputElement;
    expect(groupSel.disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Guardar Borrador' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Validar art/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aprobar Clasificación' })).toBeTruthy();
    expect(screen.queryByText(/Clasificación enviada/)).toBeNull();
  });

  it('2/3/4. ALMACEN_APROBADO bloquea campos y oculta acciones de edición', async () => {
    renderWithStatus('ALMACEN_APROBADO');
    const groupSel = await screen.findByRole('combobox', { name: /Grupo \(Profit\)/i }) as HTMLInputElement;
    expect(groupSel.disabled).toBe(true);
    expect((screen.getByRole('combobox', { name: /Tipo de art/i }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('combobox', { name: /Unidad de venta/i }) as HTMLInputElement).disabled).toBe(true);
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
    expect((await screen.findByRole('combobox', { name: /Grupo \(Profit\)/i }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Aprobar Clasificación' })).toBeNull();
  });

  it.each([
    ['PENDIENTE_CONTABILIDAD'],
    ['CONTABILIDAD_APROBADA'],
    ['INSERTADO_PROFIT'],
  ])('7/8/9. %s no permite editar', async (status) => {
    renderWithStatus(status);
    expect(await screen.findByText(/Clasificación enviada/)).toBeTruthy();
    expect((await screen.findByRole('combobox', { name: /Grupo \(Profit\)/i }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Guardar Borrador' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aprobar Clasificación' })).toBeNull();
  });

  it('10. usuario sin permiso no obtiene controles de edición en PENDIENTE_ALMACEN', async () => {
    sessionAllow.value = false;
    mockGetRequest.mockResolvedValue(REQUEST);
    renderClassify();
    expect((await screen.findByRole('combobox', { name: /Grupo \(Profit\)/i }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Guardar Borrador' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aprobar Clasificación' })).toBeNull();
  });

  it('borrador: guardar conserva PENDIENTE_ALMACEN, avisa y sigue editable', async () => {
    mockGetRequest.mockResolvedValue(REQUEST);
    renderClassify();
    await screen.findByRole('combobox', { name: /Grupo \(Profit\)/i });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Borrador' }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Borrador guardado correctamente/)).toBeTruthy();
    expect(screen.getByText(/continúa pendiente en Almacén/)).toBeTruthy();
    // Sigue editable: sin banner de enviada y con acciones visibles.
    // (el botón pasa a "Guardar Borrador ✓", prueba de que el guardado completó).
    expect(screen.queryByText(/Clasificación enviada/)).toBeNull();
    expect((screen.getByRole('combobox', { name: /Grupo \(Profit\)/i }) as HTMLInputElement).disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Guardar Borrador ✓' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aprobar Clasificación' })).toBeTruthy();
  });

  it('borrador: varios guardados parciales conservan lo anterior', async () => {
    mockGetRequest.mockResolvedValue(REQUEST);
    renderClassify();
    await screen.findByRole('combobox', { name: /Grupo \(Profit\)/i });
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
    await screen.findByRole('combobox', { name: /Grupo \(Profit\)/i });
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
    await screen.findByRole('combobox', { name: /Grupo \(Profit\)/i });
    // El auto-análisis (FASE P2: fase INICIAL) deja el Analizador ocupado.
    await waitFor(() => expect(mockAnalizar).toHaveBeenCalled(), { timeout: 3000 });
    expect(analizarLastPhase()).toBe('INICIAL');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Analizando...' })).toBeTruthy());
    const busy = screen.getByRole('button', { name: 'Analizando...' }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    resolveRun!({ input: {}, candidates: [], insufficient: false, engineVersion: 'v1' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Validar art/i })).toBeTruthy());
  });
});

describe('AlmacenClassify descripción ajustada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionAllow.value = true;
    mockGetRequest.mockResolvedValue(REQUEST);
    mockAuditEvents.mockResolvedValue({ data: [], total: 0 });
    mockSave.mockResolvedValue({});
  });

  afterEach(() => {
    cleanup();
  });

  it('prellena con la original y envía el ajuste al guardar', async () => {
    renderClassify();
    const input = await screen.findByLabelText(/Descripción ajustada/i) as HTMLInputElement;
    expect(input.value).toBe('TORNILLO');
    fireEvent.change(input, { target: { value: 'TORNILLO HEX 1/2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Borrador' }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0]![1]).toMatchObject({ adjustedDescription: 'TORNILLO HEX 1/2' });
  });

  it('sin cambios no crea ajuste (envía vacío)', async () => {
    renderClassify();
    await screen.findByLabelText(/Descripción ajustada/i);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar Borrador' }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    expect(mockSave.mock.calls[0]![1]).toMatchObject({ adjustedDescription: '' });
  });

  it('prefill muestra un ajuste ya guardado', async () => {
    mockGetRequest.mockResolvedValue({ ...REQUEST, adjustedDescription: 'TORNILLO CORTO' });
    renderClassify();
    const input = await screen.findByLabelText(/Descripción ajustada/i) as HTMLInputElement;
    expect(input.value).toBe('TORNILLO CORTO');
  });
});
