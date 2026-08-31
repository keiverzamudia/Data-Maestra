import type { CatalogGroup, CatalogSubgroup, CatalogCategory, Brand, UnitOfMeasure } from '../../types';
import { api } from './api-client';

export async function getCatalogGroups(): Promise<CatalogGroup[]> {
  return api.get<CatalogGroup[]>('/api/v1/catalogs/groups');
}

export async function getCatalogSubgroups(): Promise<CatalogSubgroup[]> {
  return api.get<CatalogSubgroup[]>('/api/v1/catalogs/subgroups');
}

export async function getCatalogCategories(): Promise<CatalogCategory[]> {
  return api.get<CatalogCategory[]>('/api/v1/catalogs/categories');
}

export async function getCatalogBrands(): Promise<Brand[]> {
  return api.get<Brand[]>('/api/v1/catalogs/brands');
}

export async function getCatalogUnits(): Promise<UnitOfMeasure[]> {
  return api.get<UnitOfMeasure[]>('/api/v1/catalogs/units');
}
