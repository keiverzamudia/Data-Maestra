import type { CatalogGroup, CatalogSubgroup, CatalogCategory, Brand, Manufacturer, UnitOfMeasure } from '../types';
export const groups: CatalogGroup[] = [
  { id: 'g1', code: 'RVH', name: 'Repuestos de Vehículos' },
  { id: 'g2', code: 'MEC', name: 'Mecánica' },
  { id: 'g3', code: 'ELE', name: 'Eléctrico' },
  { id: 'g4', code: 'HID', name: 'Hidráulico' },
  { id: 'g5', code: 'TRA', name: 'Transmisión' },
];
export const subgroups: CatalogSubgroup[] = [
  { id: 'sg1', groupId: 'g1', code: 'CAR', name: 'Carrocería' },
  { id: 'sg2', groupId: 'g1', code: 'MOT', name: 'Motor' },
  { id: 'sg3', groupId: 'g2', code: 'ROD', name: 'Rodamientos' },
  { id: 'sg4', groupId: 'g3', code: 'CON', name: 'Contactores' },
  { id: 'sg5', groupId: 'g4', code: 'BOM', name: 'Bombas' },
];
export const categories: CatalogCategory[] = [
  { id: 'cat1', subgroupId: 'sg1', code: 'PAR-DEL', name: 'Parachoque Delantero' },
  { id: 'cat2', subgroupId: 'sg2', code: 'FIL-DIE', name: 'Filtro Diesel' },
  { id: 'cat3', subgroupId: 'sg3', code: 'ROD-6205', name: 'Rodamiento 6205' },
  { id: 'cat4', subgroupId: 'sg4', code: 'CON-TRI', name: 'Contactor Trifásico' },
];
export const manufacturers: Manufacturer[] = [
  { id: 'mfr1', name: 'Foton' },
  { id: 'mfr2', name: 'SKF' },
  { id: 'mfr3', name: 'Schneider Electric' },
  { id: 'mfr4', name: 'Parker' },
];
export const brands: Brand[] = [
  { id: 'b1', name: 'Fleetguard', normalizedName: 'FLEETGUARD', manufacturerId: 'mfr1' },
  { id: 'b2', name: 'SKF', normalizedName: 'SKF', manufacturerId: 'mfr2' },
  { id: 'b3', name: 'Schneider', normalizedName: 'SCHNEIDER', manufacturerId: 'mfr3' },
  { id: 'b4', name: 'Baldwin', normalizedName: 'BALDWIN', manufacturerId: 'mfr1' },
  { id: 'b5', name: 'Foton', normalizedName: 'FOTON', manufacturerId: 'mfr1' },
];
export const units: UnitOfMeasure[] = [
  { id: 'uom1', code: 'PZA', name: 'Pieza' },
  { id: 'uom2', code: 'LT', name: 'Litro' },
  { id: 'uom3', code: 'KG', name: 'Kilogramo' },
  { id: 'uom4', code: 'M', name: 'Metro' },
];
// Helper para código derivado
export function buildMasterCode(groupCode: string, subgroupCode: string, seq: number, len = 6) {
  return `${groupCode}${subgroupCode}${String(seq).padStart(len, '0')}`;
}
