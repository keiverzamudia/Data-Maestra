import type { CorporateCatalogKey } from '../../src/modulos/profit/corporate-catalogs';
import {
  buildEquivalenceMap,
  type EquivalenceLookup,
  type EquivalenceRecord,
} from '../../src/modulos/profit/corporate-equivalence';

/**
 * FASE 26 — Helpers de test para equivalencias de catálogos.
 * Mapeo compacto: { catalogKey: { codigoAD_TRANS: codigoLocal } }.
 * El vínculo solo aplica a la empresa indicada; para cualquier otra
 * (incluida AD_TRANS, que es el canónico) se comporta como identidad,
 * igual que el servicio real.
 */

export function eqRecords(
  map: Record<string, Record<string, string>>,
  companyCode = 'AD_DIST',
): EquivalenceRecord[] {
  return Object.entries(map).flatMap(([catalogKey, pairs]) =>
    Object.entries(pairs).map(([standardCode, localCode]) => ({
      id: `${catalogKey}:${companyCode}:${standardCode}`,
      catalogKey: catalogKey as CorporateCatalogKey,
      companyCode,
      standardCode,
      localCode,
      active: true,
      note: null,
      createdBy: 'u5',
    })),
  );
}

/** Columnas del payload que se traducen (mismo orden que el dominio). */
const FK_COLUMNS: Array<[keyof string, CorporateCatalogKey]> = [
  ['co_lin', 'lin_art'],
  ['co_subl', 'sub_lin'],
  ['uni_venta', 'unidades'],
  ['suni_venta', 'unidades'],
  ['tipo_imp', 'tabulado'],
  ['co_cat', 'cat_art'],
  ['co_color', 'colores'],
  ['procedenci', 'proceden'],
  ['co_prov', 'prov'],
];

/** Lookup falso idéntico al real: mismas reglas, sin Prisma ni Profit. */
export function fakeEquivalences(
  map: Record<string, Record<string, string>>,
  companyCode = 'AD_DIST',
): EquivalenceLookup {
  const full = buildEquivalenceMap(eqRecords(map, companyCode));
  const applies = (company: string): boolean =>
    String(company ?? '').trim().toUpperCase() === companyCode && companyCode !== 'AD_TRANS';
  return {
    codesForCatalog: async (company, catalogKey) => {
      const out = new Map<string, string>();
      if (!applies(company)) return out;
      for (const rec of full.values()) {
        if (rec.catalogKey === catalogKey) out.set(rec.standardCode, rec.localCode);
      }
      return out;
    },
    resolveCode: async (company, catalogKey, standardCode) => {
      if (!applies(company)) return standardCode;
      const rec = full.get(`${catalogKey}|${companyCode}|${standardCode.trim()}`);
      return rec ? rec.localCode : standardCode;
    },
    resolvePayload: async (company, payload) => {
      if (!applies(company)) return payload;
      const out: Record<string, unknown> = { ...payload };
      for (const [column, catalog] of FK_COLUMNS) {
        const current = String(out[column] ?? '').trim();
        if (!current) continue;
        const rec = full.get(`${catalog}|${companyCode}|${current}`);
        if (rec) out[column] = rec.localCode;
      }
      return out as typeof payload;
    },
  };
}
