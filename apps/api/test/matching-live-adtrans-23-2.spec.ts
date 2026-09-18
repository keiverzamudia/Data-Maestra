/**
 * FASE 23.2 — Verificación viva contra AD_TRANS real.
 *
 * SOLO se ejecuta con PROFIT_LIVE=1. Todo lo que toca Profit son SELECT
 * (conteo, lectura de filas, columnas de foto). La única escritura es la
 * ingesta idempotente en la base LOCAL (perfiles), jamás en Profit.
 * Sin flag, el archivo entero se omite (skip) para no depender de red.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const LIVE = process.env.PROFIT_LIVE === '1';

function loadLocalEnv() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dotenv = require('dotenv');
    for (const f of ['.env.local', '.env']) {
      const p = path.join(__dirname, '..', f);
      if (fs.existsSync(p)) dotenv.config({ path: p, override: false });
    }
  } catch {
    /* sin dotenv: usa variables ya presentes */
  }
}

describe.skipIf(!LIVE)('23.2 AD_TRANS en vivo (solo lectura + ingesta local)', () => {
  it('universo real: conteo, artículo de referencia y realidad de fotos', async () => {
    loadLocalEnv();
    const { ProfitAdapterService } = await import('../src/modulos/profit/profit-adapter.service');
    const { ConfigService } = await import('@nestjs/config');
    const adapter = new ProfitAdapterService(new ConfigService());
    const total = await adapter.rawQuery<{ n: number }>('SELECT COUNT(1) AS n FROM dbo.art', {});
    expect(total[0]!.n).toBeGreaterThan(10000);
    const ref = await adapter.rawQuery<Record<string, unknown>>(
      "SELECT TOP 1 co_art, art_des, co_lin, co_subl, co_cat, co_color, uni_venta FROM dbo.art WHERE LTRIM(RTRIM(co_art)) = '094-7134-CAT'",
      {},
    );
    expect(String(ref[0]?.['co_art'] ?? '').trim()).toBe('094-7134-CAT');
    const photos = await adapter.rawQuery<{ n: number }>(
      'SELECT COUNT(1) AS n FROM dbo.art WHERE picture IS NOT NULL',
      {},
    );
    expect(photos[0]!.n).toBe(0);
  }, 60000);

  it('motor v1 contra descripciones reales (puro, sin escrituras)', async () => {
    loadLocalEnv();
    const { ProfitAdapterService } = await import('../src/modulos/profit/profit-adapter.service');
    const { ConfigService } = await import('@nestjs/config');
    const { DeterministicMatchEngineV1 } = await import('../src/modulos/matching/domain/match-engine');
    const { DeterministicNormalizerV2 } = await import('../src/modulos/matching/domain/matching-contracts');
    const adapter = new ProfitAdapterService(new ConfigService());
    const rows = await adapter.rawQuery<Record<string, string>>(
      'SELECT TOP 60 co_art, art_des, co_lin, co_subl, co_color, uni_venta FROM dbo.art ORDER BY co_art',
      {},
    );
    expect(rows.length).toBeGreaterThan(10);
    const normalizer = new DeterministicNormalizerV2();
    const snapshots = rows.map((r) => {
      const v2 = normalizer.normalize({
        companyCode: 'AD_TRANS',
        description: String(r['art_des'] ?? ''),
        brand: String(r['co_color'] ?? '').trim() || undefined,
        category: String(r['co_lin'] ?? '').trim() || undefined,
        subCategory: String(r['co_subl'] ?? '').trim() || undefined,
        unit: String(r['uni_venta'] ?? '').trim() || undefined,
      });
      return {
        article: { companyCode: 'AD_TRANS', profitArticleCode: String(r['co_art']).trim() },
        description: v2.normalizedDescription,
        brand: String(r['co_color'] ?? '').trim() || undefined,
        category: String(r['co_lin'] ?? '').trim() || undefined,
        subCategory: String(r['co_subl'] ?? '').trim() || undefined,
        unit: String(r['uni_venta'] ?? '').trim() || undefined,
      };
    });
    const engine = new DeterministicMatchEngineV1({ listCandidates: async () => snapshots });
    // CASO A — coincidencia fuerte redactada como usuario.
    const casoA = await engine.findCandidates({
      companyCode: 'AD_TRANS',
      description: 'PIN PISTON CATERPILLAR 320',
    } as never);
    const topA = casoA[0]?.article.profitArticleCode;
    expect(['094-7134-CAT']).toContain(topA);
    const scoreA = casoA[0]?.score ?? 0;
    // CASO G — sin relación: el mejor score debe ser claramente menor.
    const casoG = await engine.findCandidates({
      companyCode: 'AD_TRANS',
      description: 'SOPORTE IZQUIERDO DE CAJA PERSONALIZADO XYZQ',
    } as never);
    const scoreG = casoG[0]?.score ?? 100;
    expect(scoreG).toBeLessThan(scoreA);
  }, 60000);

  it('ingesta real por lotes crece el universo local (idempotente)', async () => {
    loadLocalEnv();
    const { PrismaService } = await import('../src/comun/prisma/prisma.service');
    const { ProfitAdapterService } = await import('../src/modulos/profit/profit-adapter.service');
    const { CorporateCompaniesService } = await import('../src/modulos/profit/corporate-companies.service');
    const { AuditoriaService } = await import('../src/modulos/auditoria/auditoria.service');
    const { MatchingRepository } = await import('../src/modulos/matching/infrastructure/matching.repository');
    const { HistoricalUniverseService } = await import('../src/modulos/matching/application/historical-universe.service');
    const { ConfigService } = await import('@nestjs/config');
    const prisma = new PrismaService();
    await prisma.$connect();
    try {
      const adapter = new ProfitAdapterService(new ConfigService());
      const companies = new CorporateCompaniesService(adapter);
      const auditoria = new AuditoriaService(prisma);
      const repository = new MatchingRepository(prisma);
      const universe = new HistoricalUniverseService(prisma, adapter, companies, repository, auditoria);
      const before: number = await prisma.articleNormalizationProfile.count({ where: { companyCode: 'AD_TRANS' } });
      const batchSize = Math.max(1, Math.min(parseInt(process.env.PROFIT_LIVE_BATCH ?? '200', 10) || 200, 500));
      const maxBatches = Math.max(1, Math.min(parseInt(process.env.PROFIT_LIVE_BATCHES ?? '4', 10) || 4, 20));
      const startOffset = Math.max(0, parseInt(process.env.PROFIT_LIVE_OFFSET ?? '0', 10) || 0);
      const res = await universe.ingestCompany('AD_TRANS', { batchSize, maxBatches, startOffset });
      expect(res.errors).toEqual([]);
      // La cola final puede ser menor que un lote completo (corte natural).
      expect(res.processed).toBeGreaterThan(0);
      expect(res.processed).toBeLessThanOrEqual(batchSize * maxBatches);
      const after: number = await prisma.articleNormalizationProfile.count({ where: { companyCode: 'AD_TRANS' } });
      expect(after).toBeGreaterThanOrEqual(Math.min(before + 1, batchSize * maxBatches));
    } finally {
      await prisma.$disconnect();
    }
  }, 590000);
});
