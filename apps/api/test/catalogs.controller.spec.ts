import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogosController } from '../src/modulos/catalogos/catalogos.controller';
import { CatalogosService } from '../src/modulos/catalogos/catalogos.service';

function createCatalogosServiceMock() {
  return {
    findAllGroups: vi.fn(),
    findAllSubgroups: vi.fn(),
    findAllCategories: vi.fn(),
    findAllBrands: vi.fn(),
    findAllUnits: vi.fn(),
  };
}

describe('CatalogosController', () => {
  let controller: CatalogosController;
  let CatalogosService: ReturnType<typeof createCatalogosServiceMock>;

  beforeEach(() => {
    CatalogosService = createCatalogosServiceMock();
    controller = new CatalogosController(CatalogosService as unknown as CatalogosService);
  });

  describe('GET /catalogs/groups', () => {
    it('returns an array of catalog groups', async () => {
      const mockGroups = [
        { id: 'g1', code: 'ELEC', name: 'Electrónica' },
        { id: 'g2', code: 'MEC', name: 'Mecánica' },
      ];
      CatalogosService.findAllGroups.mockResolvedValue(mockGroups);

      const result = await controller.findGroups();

      expect(result).toEqual(mockGroups);
      expect(CatalogosService.findAllGroups).toHaveBeenCalledOnce();
    });

    it('returns empty array when no groups exist', async () => {
      CatalogosService.findAllGroups.mockResolvedValue([]);

      const result = await controller.findGroups();

      expect(result).toEqual([]);
    });
  });

  describe('GET /catalogs/brands', () => {
    it('returns an array of brands', async () => {
      const mockBrands = [
        { id: 'b1', name: 'Siemens' },
        { id: 'b2', name: 'ABB' },
      ];
      CatalogosService.findAllBrands.mockResolvedValue(mockBrands);

      const result = await controller.findBrands();

      expect(result).toEqual(mockBrands);
      expect(CatalogosService.findAllBrands).toHaveBeenCalledOnce();
    });

    it('returns empty array when no brands exist', async () => {
      CatalogosService.findAllBrands.mockResolvedValue([]);

      const result = await controller.findBrands();

      expect(result).toEqual([]);
    });
  });
});
