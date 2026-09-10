import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PROFIT_ARTICLE_TYPE_DOMAIN,
  FUNCTIONAL_ARTICLE_TYPES,
  RESERVED_ARTICLE_TYPES,
  ARTICLE_TYPE_LABELS,
  isArticleTypeCode,
  isTaxTypeCode,
  expectedTaxTypeFor,
  checkTaxCoherence,
} from '../src/modulos/profit/article-taxonomy';
import { CatalogosService } from '../src/modulos/catalogos/catalogos.service';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';
import { BadRequestException } from '@nestjs/common';

describe('article-taxonomy (14C-FORM §5/§13/§14)', () => {
  it('expone el dominio completo del CHECK sin MP', () => {
    expect([...PROFIT_ARTICLE_TYPE_DOMAIN].sort()).toEqual(['C', 'E', 'F', 'M', 'N', 'S', 'V']);
    expect(PROFIT_ARTICLE_TYPE_DOMAIN).not.toContain('MP');
  });

  it('funcionales C/S/V y reservados F/E/M/N', () => {
    expect(FUNCTIONAL_ARTICLE_TYPES).toEqual(['C', 'S', 'V']);
    expect(RESERVED_ARTICLE_TYPES).toEqual(['F', 'E', 'M', 'N']);
    expect(ARTICLE_TYPE_LABELS.C).toBe('Consumo');
    expect(ARTICLE_TYPE_LABELS.S).toBe('Servicio');
    expect(ARTICLE_TYPE_LABELS.V).toBe('Venta');
  });

  it('valida dominios', () => {
    expect(isArticleTypeCode('C')).toBe(true);
    expect(isArticleTypeCode('MP')).toBe(false);
    expect(isArticleTypeCode('')).toBe(false);
    expect(isTaxTypeCode('1')).toBe(true);
    expect(isTaxTypeCode('10')).toBe(false);
    expect(isTaxTypeCode('co_imp')).toBe(false);
  });

  it('regla tipo→tasa: S exento (6), resto gravado (1)', () => {
    expect(expectedTaxTypeFor('S')).toBe('6');
    expect(expectedTaxTypeFor('C')).toBe('1');
    expect(expectedTaxTypeFor('V')).toBe('1');
  });

  it('coherencia: desviación es advertencia, no bloqueo (excepciones reales S→1/4/5)', () => {
    expect(checkTaxCoherence('C', '1')).toEqual({ ok: true });
    const coh = checkTaxCoherence('S', '1');
    expect(coh.ok).toBe(true);
    expect(coh.warning).toContain('6');
  });
});

describe('CatalogosService.checkClassification (dry-run sin escritura)', () => {
  let service: CatalogosService;
  const db: any = {
    catalogGroup: { findUnique: vi.fn() },
    catalogSubgroup: { findFirst: vi.fn() },
    catalogCategory: { findFirst: vi.fn() },
    brand: { findFirst: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CatalogosService(db);
  });

  it('resuelve combinación válida sin escribir', async () => {
    db.catalogGroup.findUnique.mockResolvedValue({ id: 'g1', code: 'RVH' });
    db.catalogSubgroup.findFirst.mockResolvedValue({ id: 's1' });
    db.catalogCategory.findFirst.mockResolvedValue({ id: 'c1' });
    db.brand.findFirst.mockResolvedValue({ id: 'b1' });

    const r = await service.checkClassification(db, { groupCode: 'RVH', subgroupCode: 'CAR' });
    expect(r.groupId).toBe('g1');
    expect(r.wouldProvision).toEqual([]);
  });

  it('rechaza subgrupo de otra línea', async () => {
    db.catalogGroup.findUnique.mockResolvedValue({ id: 'g1', code: 'RVH' });
    db.catalogSubgroup.findFirst.mockResolvedValue(null);

    await expect(
      service.checkClassification(db, { groupCode: 'RVH', subgroupCode: 'XXX' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('reporta provisión en lugar de crear', async () => {
    db.catalogGroup.findUnique.mockResolvedValue({ id: 'g1', code: 'RVH' });
    db.catalogSubgroup.findFirst.mockResolvedValue({ id: 's1' });
    db.catalogCategory.findFirst.mockResolvedValue(null);
    db.brand.findFirst.mockResolvedValue(null);

    const r = await service.checkClassification(db, {
      groupCode: 'RVH',
      subgroupCode: 'CAR',
      categoryCode: '99',
      brandCode: 'ZZ',
    });
    expect(r.wouldProvision).toEqual(['category:99', 'brand:ZZ']);
  });
});

describe('SolicitudesService.validateClassification (§24)', () => {
  function makeService(overrides: { request?: any; profitUnit?: any; dup?: any; noProfit?: boolean } = {}) {
    const prisma: any = {
      request: { findUnique: vi.fn().mockResolvedValue(overrides.request ?? {
        id: 'req-1', status: 'PENDIENTE_ALMACEN', requestedDescription: 'TORNILLO HEX 1/4',
      }) },
      catalogGroup: { findUnique: vi.fn().mockResolvedValue({ id: 'g1', code: 'RVH' }) },
      catalogSubgroup: { findFirst: vi.fn().mockResolvedValue({ id: 's1' }) },
      catalogCategory: { findFirst: vi.fn().mockResolvedValue({ id: 'c1' }) },
      brand: { findFirst: vi.fn().mockResolvedValue({ id: 'b1' }) },
      masterItem: { findFirst: vi.fn().mockResolvedValue(overrides.dup ?? null) },
    };
    const catalogos = new CatalogosService(prisma);
    const hasUnit = Object.prototype.hasOwnProperty.call(overrides, 'profitUnit');
    const profit: any = { getUnit: vi.fn().mockResolvedValue(hasUnit ? overrides.profitUnit : { co_uni: 'UND' }) };
    const service = new SolicitudesService(prisma, catalogos, {} as any, {} as any, {} as any, profit);
    return { service, prisma, profit };
  }

  const full = {
    groupCode: 'RVH', subgroupCode: 'CAR', articleType: 'C', taxType: '1', unitCode: 'UND',
  };

  it('ready=true con clasificación completa', async () => {
    const { service } = makeService();
    const r = await service.validateClassification('req-1', full as any);
    expect(r.ready).toBe(true);
    expect(r.checks.every((c) => c.status !== 'ERROR')).toBe(true);
  });

  it('ready=false si faltan tipo y unidad', async () => {
    const { service } = makeService();
    const r = await service.validateClassification('req-1', { groupCode: 'RVH', subgroupCode: 'CAR' } as any);
    expect(r.ready).toBe(false);
    expect(r.checks.find((c) => c.key === 'tipo')?.status).toBe('FALTA');
    expect(r.checks.find((c) => c.key === 'unidad')?.status).toBe('FALTA');
  });

  it('unidad inexistente en Profit es ERROR', async () => {
    const { service } = makeService({ profitUnit: null });
    const r = await service.validateClassification('req-1', full as any);
    expect(r.ready).toBe(false);
    expect(r.checks.find((c) => c.key === 'unidad')?.status).toBe('ERROR');
  });

  it('desviación tipo→tasa genera advertencia sin bloquear', async () => {
    const { service } = makeService();
    const r = await service.validateClassification('req-1', { ...full, articleType: 'S', taxType: '1' } as any);
    expect(r.ready).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('duplicado homologado genera advertencia', async () => {
    const { service } = makeService({ dup: { id: 'm1', masterCode: 'RVHCAR-00001' } });
    const r = await service.validateClassification('req-1', full as any);
    expect(r.ready).toBe(true);
    expect(r.warnings.join(' ')).toContain('RVHCAR-00001');
  });
});
