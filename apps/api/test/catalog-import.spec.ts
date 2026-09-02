import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CatalogImportService } from '../src/modulos/catalogos/catalog-import.service';

function createPrismaMock() {
  return {
    catalogGroup: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    catalogSubgroup: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  };
}

describe('CatalogImportService', () => {
  let service: CatalogImportService;
  let prisma: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new CatalogImportService(prisma as any);
  });

  describe('parseCsvLine', () => {
    it('parses a valid CSV line', () => {
      const result = service.parseCsvLine('"01    ";COMBUSTIBLE;"01    ";GASOIL');
      expect(result).toEqual({
        groupCode: '01',
        groupName: 'COMBUSTIBLE',
        subgroupCode: '01',
        subgroupName: 'GASOIL',
      });
    });

    it('returns null for empty line', () => {
      expect(service.parseCsvLine('')).toBeNull();
    });

    it('returns null for line with less than 4 parts', () => {
      expect(service.parseCsvLine('"01";COMBUSTIBLE')).toBeNull();
    });

    it('handles codes with trailing spaces', () => {
      const result = service.parseCsvLine('"RVH   ";REPUESTOS DE VEHICULOS;"FIL   ";FILTROS');
      expect(result?.groupCode).toBe('RVH');
      expect(result?.subgroupCode).toBe('FIL');
    });
  });

  describe('parseCsvContent', () => {
    it('parses multi-line CSV content', () => {
      const content = '"01";COMBUSTIBLE;"01";GASOIL\n"02";SERVICIO;"02";FLETE';
      const rows = service.parseCsvContent(content);
      expect(rows).toHaveLength(2);
      expect(rows[0].groupCode).toBe('01');
      expect(rows[1].groupCode).toBe('02');
    });

    it('skips empty lines', () => {
      const content = '"01";COMBUSTIBLE;"01";GASOIL\n\n\n"02";SERVICIO;"02";FLETE';
      const rows = service.parseCsvContent(content);
      expect(rows).toHaveLength(2);
    });
  });

  describe('importFromRows', () => {
    it('creates new groups and subgroups', async () => {
      prisma.catalogGroup.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'new-g1', code: '01', name: 'COMBUSTIBLE', sourceSystem: 'PROFIT', sourceCode: '01' }])
        .mockResolvedValueOnce([{ id: 'new-g1', code: '01', name: 'COMBUSTIBLE', sourceSystem: 'PROFIT', sourceCode: '01' }]);
      prisma.catalogSubgroup.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.catalogGroup.create.mockResolvedValue({ id: 'new-g1', code: '01', name: 'COMBUSTIBLE', sourceSystem: 'PROFIT', sourceCode: '01' });
      prisma.catalogSubgroup.create.mockResolvedValue({ id: 'new-sg1', groupId: 'new-g1', code: '01', name: 'GASOIL', sourceSystem: 'PROFIT', sourceCode: '01' });

      const rows = [{ groupCode: '01', groupName: 'COMBUSTIBLE', subgroupCode: '01', subgroupName: 'GASOIL' }];
      const result = await service.importFromRows(rows);

      expect(result.groups.created).toBe(1);
      expect(result.subgroups.created).toBe(1);
      expect(prisma.catalogGroup.create).toHaveBeenCalledWith({
        data: { code: '01', name: 'COMBUSTIBLE', sourceSystem: 'PROFIT', sourceCode: '01' },
      });
    });

    it('updates existing group name from Profit', async () => {
      prisma.catalogGroup.findMany.mockResolvedValue([
        { id: 'g1', code: 'RVH', name: 'Repuestos de Vehículos', sourceSystem: null, sourceCode: null },
      ]);
      prisma.catalogSubgroup.findMany.mockResolvedValue([]);

      const rows = [{ groupCode: 'RVH', groupName: 'REPUESTOS DE VEHICULOS', subgroupCode: 'FIL', subgroupName: 'FILTROS' }];
      const result = await service.importFromRows(rows);

      expect(result.groups.updated).toBe(1);
      expect(prisma.catalogGroup.update).toHaveBeenCalledWith({
        where: { id: 'g1' },
        data: { name: 'REPUESTOS DE VEHICULOS', sourceSystem: 'PROFIT', sourceCode: 'RVH' },
      });
    });

    it('does not duplicate on second import', async () => {
      prisma.catalogGroup.findMany.mockResolvedValue([
        { id: 'g1', code: '01', name: 'COMBUSTIBLE', sourceSystem: 'PROFIT', sourceCode: '01' },
      ]);
      prisma.catalogSubgroup.findMany.mockResolvedValue([
        { id: 'sg1', groupId: 'g1', code: '01', name: 'GASOIL', sourceSystem: 'PROFIT', sourceCode: '01' },
      ]);

      const rows = [{ groupCode: '01', groupName: 'COMBUSTIBLE', subgroupCode: '01', subgroupName: 'GASOIL' }];
      const result = await service.importFromRows(rows);

      expect(result.groups.created).toBe(0);
      expect(result.groups.unchanged).toBe(1);
      expect(result.subgroups.created).toBe(0);
      expect(result.subgroups.unchanged).toBe(1);
    });

    it('preserves local groups not in Profit', async () => {
      prisma.catalogGroup.findMany.mockResolvedValue([
        { id: 'g1', code: 'HID', name: 'Hidráulico', sourceSystem: null, sourceCode: null },
      ]);
      prisma.catalogSubgroup.findMany.mockResolvedValue([]);

      const rows = [{ groupCode: '01', groupName: 'COMBUSTIBLE', subgroupCode: '01', subgroupName: 'GASOIL' }];
      const result = await service.importFromRows(rows);

      expect(result.localGroupsPreserved).toContain('HID (Hidráulico)');
    });

    it('preserves local subgroups not in Profit', async () => {
      prisma.catalogGroup.findMany.mockResolvedValue([
        { id: 'g1', code: 'RVH', name: 'REPUESTOS DE VEHICULOS', sourceSystem: 'PROFIT', sourceCode: 'RVH' },
      ]);
      prisma.catalogSubgroup.findMany.mockResolvedValue([
        { id: 'sg1', groupId: 'g1', code: 'CAR', name: 'Carrocería', sourceSystem: null, sourceCode: null },
      ]);

      const rows = [{ groupCode: 'RVH', groupName: 'REPUESTOS DE VEHICULOS', subgroupCode: 'FIL', subgroupName: 'FILTROS' }];
      const result = await service.importFromRows(rows);

      expect(result.localSubgroupsPreserved).toContain('RVH/CAR (Carrocería)');
    });

    it('does not collide subgroup with same code but different group', async () => {
      prisma.catalogGroup.findMany.mockResolvedValue([
        { id: 'g1', code: 'ELE', name: 'ELECTRICIDAD', sourceSystem: 'PROFIT', sourceCode: 'ELE' },
        { id: 'g2', code: 'FER', name: 'FERRETERIA', sourceSystem: 'PROFIT', sourceCode: 'FER' },
      ]);
      prisma.catalogSubgroup.findMany.mockResolvedValue([]);

      const rows = [
        { groupCode: 'ELE', groupName: 'ELECTRICIDAD', subgroupCode: 'CON', subgroupName: 'CONECTORES' },
        { groupCode: 'FER', groupName: 'FERRETERIA', subgroupCode: 'CON', subgroupName: 'CONEXIONES' },
      ];
      const result = await service.importFromRows(rows);

      expect(result.subgroups.created).toBe(2);
      expect(prisma.catalogSubgroup.create).toHaveBeenCalledTimes(2);
    });
  });
});
