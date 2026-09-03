import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfitController } from '../src/modulos/profit/profit.controller';
import { ProfitAdapterService } from '../src/modulos/profit/profit-adapter.service';

function createAdapterMock() {
  return {
    getAccounts: vi.fn(),
    getBrands: vi.fn(),
  };
}

describe('ProfitController GET /profit/accounts (Fase 8E.6)', () => {
  let controller: ProfitController;
  let adapter: ReturnType<typeof createAdapterMock>;

  beforeEach(() => {
    adapter = createAdapterMock();
    controller = new ProfitController(adapter as unknown as ProfitAdapterService);
  });

  it('delega en ProfitAdapter.getAccounts con límite, offset y búsqueda', async () => {
    const mock = [{ code: '1.1.02.01.01.003', description: 'Diferencia en cambio' }];
    adapter.getAccounts.mockResolvedValue(mock);

    const result = await controller.getAccounts('20', '0', 'cambio');

    expect(adapter.getAccounts).toHaveBeenCalledWith(20, 0, 'cambio');
    expect(result).toEqual(mock);
  });

  it('usa límite 20 y offset 0 por defecto', async () => {
    adapter.getAccounts.mockResolvedValue([]);

    await controller.getAccounts(undefined, undefined, undefined);

    expect(adapter.getAccounts).toHaveBeenCalledWith(20, 0, undefined);
  });

  it('limita a 100 como máximo', async () => {
    adapter.getAccounts.mockResolvedValue([]);

    await controller.getAccounts('9999', undefined, undefined);

    expect(adapter.getAccounts).toHaveBeenCalledWith(100, 0, undefined);
  });

  it('pasa el offset para paginación', async () => {
    adapter.getAccounts.mockResolvedValue([]);

    await controller.getAccounts('20', '40', 'inventario');

    expect(adapter.getAccounts).toHaveBeenCalledWith(20, 40, 'inventario');
  });
});

describe('ProfitController GET /profit/brands (FASE 8F)', () => {
  it('delega en ProfitAdapter.getBrands y devuelve código + descripción', async () => {
    const adapter = { getBrands: vi.fn().mockResolvedValue([{ co_col: 'F01', des_col: 'GASOLINA' }]) };
    const controller = new ProfitController(adapter as unknown as ProfitAdapterService);

    const result = await controller.getBrands();

    expect(adapter.getBrands).toHaveBeenCalledOnce();
    expect(result).toEqual([{ co_col: 'F01', des_col: 'GASOLINA' }]);
  });
});
