import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ProfitAdapterService } from './profit-adapter.service';
import {
  CORPORATE_GROUP_DB,
  dedupeCompanies,
  type ProfitCompany,
} from './corporate-company';

/**
 * FASE 17 §9 — Descubrimiento dinámico de empresas desde el catálogo
 * corporativo AD_GRUP.dbo.TEmpresas. Sin hardcodear las 6 actuales: si
 * mañana aparece AD_NUEVA_EMPRESA, aparece automáticamente.
 * Solo lectura (pool READ del adapter). Caché corto (60 s).
 */
@Injectable()
export class CorporateCompaniesService {
  private readonly logger = new Logger(CorporateCompaniesService.name);
  private cache: { at: number; companies: ProfitCompany[] } | null = null;
  private static readonly TTL_MS = 60_000;

  constructor(private readonly profitAdapter: ProfitAdapterService) {}

  /** Lista validada y deduplicada (TEmpresas es heap sin PK, Fase 16 §3). */
  async listCompanies(forceRefresh = false): Promise<ProfitCompany[]> {
    if (!forceRefresh && this.cache && Date.now() - this.cache.at < CorporateCompaniesService.TTL_MS) {
      return this.cache.companies;
    }
    let rows: Array<{ cod_emp: string; nombre: string; rif: string }>;
    try {
      rows = await this.profitAdapter.rawQuery<{ cod_emp: string; nombre: string; rif: string }>(
        `SELECT LTRIM(RTRIM(cod_emp)) AS cod_emp, LTRIM(RTRIM(nombre)) AS nombre, LTRIM(RTRIM(rif)) AS rif FROM [${CORPORATE_GROUP_DB}].dbo.TEmpresas ORDER BY cod_emp`,
      );
    } catch (e: any) {
      this.logger.error(`TEmpresas unavailable: ${e?.message}`);
      throw new ServiceUnavailableException('Catálogo corporativo de empresas no disponible');
    }
    const companies = dedupeCompanies(
      (rows ?? [])
        .map((r) => ({ code: r.cod_emp ?? '', name: r.nombre ?? '', rif: r.rif ?? '' }))
        .filter((r) => /^[A-Z0-9_]{1,30}$/.test(r.code.trim().toUpperCase())),
    );
    this.cache = { at: Date.now(), companies };
    return companies;
  }

  /** ¿La empresa está listada en el catálogo corporativo? (preflight #1). */
  async isListed(code: string): Promise<ProfitCompany | null> {
    const companies = await this.listCompanies();
    return companies.find((c) => c.code === String(code ?? '').trim().toUpperCase()) ?? null;
  }

  clearCache(): void {
    this.cache = null;
  }
}
