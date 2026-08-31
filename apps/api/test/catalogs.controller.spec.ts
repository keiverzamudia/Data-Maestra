import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogsController } from '../src/modules/catalogs/catalogs.controller';
import { CatalogsService } from '../src/modules/catalogs/catalogs.service';

function createCatalogsServiceMock() {
  return {
    findAllGroups: vi.fn(),
    findAllSubgroups: vi.fn(),
    findAllCategories: vi.fn(),
    findAllBrands: vi.fn(),
    findAllUnits: vi.fn(),
  };
}

describe('CatalogsController', () => {
  let controller: CatalogsController;
  let catalogsService: ReturnType<typeof createCatalogsServiceMock>;

  beforeEach(() => {
    catalogsService = createCatalogsServiceMock();
    controller = new CatalogsController(catalogsService as unknown as CatalogsService);
  });

  describe('GET /catalogs/groups', () => {
    it('returns an array of catalog groups', async () => {
      const mockGroups = [
        { id: 'g1', code: 'ELEC', name: 'Electrónica' },
        { id: 'g2', code: 'MEC', name: 'Mecánica' },
      ];
      catalogsService.findAllGroups.mockResolvedValue(mockGroups);

      const result = await controller.findGroups();

      expect(result).toEqual(mockGroups);
      expect(catalogsService.findAllGroups).toHaveBeenCalledOnce();
    });

    it('returns empty array when no groups exist', async () => {
      catalogsService.findAllGroups.mockResolvedValue([]);

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
      catalogsService.findAllBrands.mockResolvedValue(mockBrands);

      const result = await controller.findBrands();

      expect(result).toEqual(mockBrands);
      expect(catalogsService.findAllBrands).toHaveBeenCalledOnce();
    });

    it('returns empty array when no brands exist', async () => {
      catalogsService.findAllBrands.mockResolvedValue([]);

      const result = await controller.findBrands();

      expect(result).toEqual([]);
    });
  });
});
