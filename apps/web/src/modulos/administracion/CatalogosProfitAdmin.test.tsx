// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CatalogosProfitAdmin } from './CatalogosProfitAdmin';
import { apiCatalogConfigService } from '../../servicios/api/api-catalog-config-service';

vi.mock('../../servicios/api/api-catalog-config-service', () => ({
  apiCatalogConfigService: { view: vi.fn(), setMode: vi.fn(), setItems: vi.fn(), sync: vi.fn() },
}));
vi.mock('../../hooks/useOrganizacion', () => ({
  useOrganizacion: () => ({
    empresas: [{ id: 'c1', name: 'Empresa A' }, { id: 'c2', name: 'Empresa B' }],
    usuarios: [], departamentos: [],
  }),
}));

const viewMock = apiCatalogConfigService.view as any;
const modeMock = apiCatalogConfigService.setMode as any;
const itemsMock = apiCatalogConfigService.setItems as any;
const syncMock = apiCatalogConfigService.sync as any;

const VIEW: any = {
  items: [
    { code: 'AGR', description: 'INSUMOS AGRICOLA', parentCode: '', visible: true, availableInProfit: true, isNew: false, synchronizedAt: null },
    { code: 'FER', description: 'FERRETERIA', parentCode: '', visible: false, availableInProfit: true, isNew: true, synchronizedAt: null },
    { code: 'OLD', description: 'OBSOLETO', parentCode: '', visible: false, availableInProfit: false, isNew: false, synchronizedAt: null },
  ],
  total: 3, page: 1, limit: 50, mode: 'SELECTED', source: 'PROFIT_LIVE', synchronizedAt: null,
};

describe('CatalogosProfitAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewMock.mockResolvedValue(structuredClone(VIEW));
  });
  afterEach(() => cleanup());

  it('lista con estados y contador', async () => {
    render(<MemoryRouter><CatalogosProfitAdmin /></MemoryRouter>);
    expect(await screen.findByText('AGR')).toBeTruthy();
    expect(screen.getByText('INSUMOS AGRICOLA')).toBeTruthy();
    expect(screen.getByText('NUEVO')).toBeTruthy();
    expect(screen.getByText('NO DISPONIBLE EN PROFIT')).toBeTruthy();
    expect(screen.getByText(/1 seleccionados/)).toBeTruthy();
  });

  it('cambiar modo pide confirmación y guarda', async () => {
    modeMock.mockResolvedValue({});
    render(<MemoryRouter><CatalogosProfitAdmin /></MemoryRouter>);
    await screen.findByText('AGR');
    fireEvent.click(screen.getByRole('radio', { name: /Mostrar todos/ }));
    expect(await screen.findByText(/todos los elementos activos de Profit quedarán disponibles/)).toBeTruthy();
    fireEvent.click(screen.getAllByText('Confirmar')[0]!);
    await waitFor(() => expect(modeMock).toHaveBeenCalledWith('GROUP', 'ALL', undefined));
  });

  it('marcar y guardar envía habilitados', async () => {
    itemsMock.mockResolvedValue({ updated: 1 });
    render(<MemoryRouter><CatalogosProfitAdmin /></MemoryRouter>);
    await screen.findByText('AGR');
    fireEvent.click(screen.getByLabelText('Visible FER'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    await waitFor(() => expect(itemsMock).toHaveBeenCalledWith(
      'GROUP', [{ code: 'FER', parentCode: undefined }], true, undefined,
    ));
  });

  it('sincronizar reporta resultado', async () => {
    syncMock.mockResolvedValue({ total: 4, created: 1, updated: 3, unavailable: 0 });
    render(<MemoryRouter><CatalogosProfitAdmin /></MemoryRouter>);
    await screen.findByText('AGR');
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar con Profit/ }));
    expect(await screen.findByText(/1 nuevos/)).toBeTruthy();
    expect(syncMock).toHaveBeenCalledWith('GROUP');
  });

  it('cambia de catálogo y empresa', async () => {
    render(<MemoryRouter><CatalogosProfitAdmin /></MemoryRouter>);
    await screen.findByText('AGR');
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar página' }));
    expect(screen.getByText(/3 seleccionados/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(screen.getByText(/0 seleccionados/)).toBeTruthy();
  });

  it('loading y error', async () => {
    render(<MemoryRouter><CatalogosProfitAdmin /></MemoryRouter>);
    expect(screen.getByLabelText('Cargando catálogo')).toBeTruthy();
    expect(await screen.findByText('AGR')).toBeTruthy();
    cleanup();
    viewMock.mockRejectedValueOnce(new Error('x'));
    render(<MemoryRouter><CatalogosProfitAdmin /></MemoryRouter>);
    expect(await screen.findByText('No pudimos cargar el catálogo.')).toBeTruthy();
  });
});
