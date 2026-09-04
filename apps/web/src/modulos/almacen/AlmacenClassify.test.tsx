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

const mockGetRequest = vi.fn();

// AlmacenClassify ya no consume SessionContext (10E).

vi.mock('../../servicios', () => ({
  warehouseService: {
    getRequestForClassification: (...args: unknown[]) => mockGetRequest(...args),
    saveClassification: vi.fn(),
    approveClassification: vi.fn(),
    returnRequest: vi.fn(),
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
    mockGetRequest.mockResolvedValue(REQUEST);
  });

  afterEach(() => {
    cleanup();
  });

  it('8. cambiar de grupo invalida el subgrupo anterior y filtra por grupo', async () => {
    renderClassify();

    const groupSel = await screen.findByLabelText(/Grupo \(Profit\)/i) as HTMLSelectElement;
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
