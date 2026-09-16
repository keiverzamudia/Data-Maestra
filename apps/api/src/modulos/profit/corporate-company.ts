import { BadRequestException } from '@nestjs/common';

/**
 * FASE 17 §3 — Empresa estándar corporativa.
 * Centralizado aquí: ninguna otra parte del código debe duplicar este valor.
 * AD_TRANS es el estándar; aparece también en el selector, identificada.
 */
export const STANDARD_COMPANY = 'AD_TRANS';

/** Base contable de referencia para validar cuentas de dis_cen (Fase 16 §8). */
export const STANDARD_ACCOUNTING_DB = 'C_DIST';

/** Grupo corporativo que lista las empresas (Fase 16 §3-§4). */
export const CORPORATE_GROUP_DB = 'AD_GRUP';

/**
 * Formato esperado de cod_emp / nombre de base Profit.
 * Solo mayúsculas, dígitos y guion bajo, máx. 30 (límite de identificadores
 * usados en three-part names). Nunca aceptar nombres libres del usuario.
 */
export const COMPANY_NAME_RE = /^[A-Z0-9_]{1,30}$/;

export interface ProfitCompany {
  code: string;
  name: string;
  rif: string;
  isStandard: boolean;
}

export function normalizeCompany(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

/** true solo para AD_TRANS. No existe "establecer otro estándar" en Fase 17. */
export function isStandardCompany(code: unknown): boolean {
  return normalizeCompany(code) === STANDARD_COMPANY;
}

/**
 * Valida un nombre de empresa destino. Falla cerrado ante cualquier
 * formato inesperado (fail-closed §30). Puro y testeable.
 */
export function assertValidCompanyName(raw: unknown): string {
  const code = normalizeCompany(raw);
  if (!code || !COMPANY_NAME_RE.test(code)) {
    throw new BadRequestException(`Empresa inválida: "${String(raw ?? '')}".`);
  }
  return code;
}

/**
 * Normaliza una lista de empresas destino: trim/upper, elimina vacíos y
 * duplicados, valida formato. NO incluye validación contra TEmpresas
 * (eso es preflight, con datos vivos). Pura.
 */
export function normalizeCompanyList(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : [raw];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const code = normalizeCompany(item);
    if (!code) continue;
    if (!COMPANY_NAME_RE.test(code)) {
      throw new BadRequestException(`Empresa inválida: "${String(item ?? '')}".`);
    }
    if (!seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}

/** Deduplica filas de TEmpresas por cod_emp (heap sin PK, Fase 16 §3). Pura. */
export function dedupeCompanies(rows: Array<{ code: string; name: string; rif: string }>): ProfitCompany[] {
  const seen = new Set<string>();
  const out: ProfitCompany[] = [];
  for (const r of rows) {
    const code = normalizeCompany(r.code);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: (r.name ?? '').trim(), rif: (r.rif ?? '').trim(), isStandard: code === STANDARD_COMPANY });
  }
  return out.sort((a, b) => (a.isStandard ? -1 : b.isStandard ? 1 : a.code.localeCompare(b.code)));
}
