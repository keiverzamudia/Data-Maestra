import { describe, it, expect, vi } from 'vitest';
import { normalizeText, normalizeTextV2, NORMALIZATION_VERSION, NORMALIZATION_VERSION_V2, tokenizeV2 } from '../src/modulos/matching/domain/text-normalizer';
import { compactTokenPair } from '../src/modulos/matching/domain/text-normalizer';
import { classifyToken, extractFeatures, UNIT_CANONICAL } from '../src/modulos/matching/domain/feature-extractor';
import { DeterministicNormalizerV2 } from '../src/modulos/matching/domain/matching-contracts';
import { MatchingService } from '../src/modulos/matching/application/matching.service';

describe('texto v2', () => {
  it('mayúsculas, espacios y puntuación', () => {
    expect(normalizeTextV2('  Filtro   de aceite / DT-466  ')).toBe('FILTRO DE ACEITE DT466');
  });

  it('acentos y signos españoles', () => {
    expect(normalizeTextV2('válvula (admisión) ¿motor?')).toBe('VALVULA ADMISION MOTOR');
  });

  it('v1 queda congelada (no cambia su significado)', () => {
    expect(NORMALIZATION_VERSION).toBe('v1');
    expect(normalizeText('Filtro de aceite / DT-466')).toBe('FILTRO DE ACEITE DT 466');
    expect(NORMALIZATION_VERSION_V2).toBe('v2');
  });

  it('vacío/null no lanza', () => {
    expect(normalizeTextV2('')).toBe('');
    expect(normalizeTextV2(null)).toBe('');
    expect(normalizeTextV2(undefined)).toBe('');
  });
});

describe('números y modelos (nunca se eliminan)', () => {
  it.each([
    ['DT466', 'DT466'],
    ['DT-466', 'DT466'],
    ['DT 466', 'DT466'],
    ['24V', '24V'],
    ['12V', '12V'],
    ['10W40', '10W40'],
    ['10 W40', '10W40'],
    ['1/2', '1/2'],
    ['1 / 2', '1/2'],
    ['1000', '1000'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeTextV2(input)).toBe(expected);
  });

  it('la fusión conserva todo (no elimina): número + palabra intactos', () => {
    expect(normalizeTextV2('TUBO 466 UND')).toBe('TUBO466 UND');
    expect(normalizeTextV2('BOLSA 40 LIBRAS')).toBe('BOLSA40 LIBRAS');
    expect(compactTokenPair('466', 'UND')).toBeNull();
    expect(compactTokenPair('40', 'LIBRAS')).toBeNull();
  });

  it('DT466 no se recorta a DT; 24V no se recorta a V', () => {
    expect(normalizeTextV2('DT466')).toContain('DT466');
    expect(normalizeTextV2('VALVULA 24V')).toContain('24V');
    expect(normalizeTextV2('ACEITE 10W40')).toContain('10W40');
  });
});

describe('referencias técnicas (señales, no afirmaciones)', () => {
  it.each([['LF9009'], ['P550949'], ['ABC123-01', 'ABC12301']])('%s se conserva', (input, expected) => {
    expect(normalizeTextV2(input)).toBe(expected ?? input);
  });

  it('tokens técnicos clasificados', () => {
    expect(classifyToken('FILTRO')).toBe('PALABRA');
    expect(classifyToken('1000')).toBe('NUMERO');
    expect(classifyToken('DT466')).toBe('TECNICO');
    expect(classifyToken('1/2')).toBe('FRACCION');
    expect(tokenizeV2('FILTRO P ACEITE INT DT466')).toEqual(['FILTRO', 'P', 'ACEITE', 'INT', 'DT466']);
  });
});

describe('unidades (canónicas sin alterar el original)', () => {
  it.each([
    ['KG', 'KG'], ['KILOGRAMO', 'KG'], ['KILOGRAMOS', 'KG'],
    ['LB', 'LB'], ['LIBRA', 'LB'], ['LIBRAS', 'LB'],
    ['MM', 'MM'], ['MILIMETROS', 'MM'],
    ['CM', 'CM'], ['CENTIMETROS', 'CM'],
    ['V', 'V'], ['VOLTAJE', 'V'],
  ])('%s → %s', (input, expected) => {
    expect(UNIT_CANONICAL[input]).toBe(expected);
  });

  it('unitCanonical como señal separada', () => {
    const f = extractFeatures('TORNILLO KILOGRAMOS');
    expect(f.unitCanonical).toBe('KG');
    expect(f.tokens).toContain('KILOGRAMOS');
  });
});

describe('propósito y aplicación separados', () => {
  it('no se concatenan en una cadena irreversible', () => {
    const n = new DeterministicNormalizerV2().normalize({
      companyCode: 'AD_TRANS',
      description: 'FILTRO DT466',
      purpose: 'MANTENIMIENTO PREVENTIVO DEL MOTOR DEL CAMIÓN',
      application: 'CAMIÓN INTERNATIONAL DT466',
    });
    expect(n.normalizedDescription).toBe('FILTRO DT466');
    expect(n.normalizedPurpose).toBe('MANTENIMIENTO PREVENTIVO DEL MOTOR DEL CAMION');
    expect(n.normalizedApplication).toBe('CAMION INTERNATIONAL DT466');
    expect(n.normalizationVersion).toBe('v2');
  });
});

describe('características candidatas (con evidencia mínima)', () => {
  it('modelo y parte detectados como señales', () => {
    const n = new DeterministicNormalizerV2().normalize({
      companyCode: 'AD_TRANS',
      description: 'FILTRO ACEITE INT DT466',
      partNumber: 'LF9009',
    });
    expect(n.modelCandidate).toBe('DT466');
    expect(n.partNumberCandidate).toBe('LF9009');
    expect(n.technicalTokens).toEqual(expect.arrayContaining(['DT466', 'LF9009']));
  });

  it('marca solo por catálogo exacto, sin equivalencias inventadas', () => {
    const n = new DeterministicNormalizerV2().normalize(
      { companyCode: 'AD_TRANS', description: 'FILTRO INT DT466' },
      ['INTERNATIONAL'],
    );
    expect(n.brandCandidate).toBeNull();
    const n2 = new DeterministicNormalizerV2().normalize(
      { companyCode: 'AD_TRANS', description: 'FILTRO INTERNATIONAL DT466' },
      ['INTERNATIONAL'],
    );
    expect(n2.brandCandidate).toBe('INTERNATIONAL');
  });
});

describe('idempotencia v2', () => {
  it('normalize(normalize(x)) === normalize(x)', () => {
    const samples = [
      '  Filtro   de aceite / DT-466  ',
      'FILTRO P/ACEITE INT DT466',
      'TORNILLO 1/2 24V',
      'VÁLVULA (ADMISIÓN) 10W40',
      'ABC123-01',
      '',
    ];
    for (const s of samples) {
      expect(normalizeTextV2(normalizeTextV2(s))).toBe(normalizeTextV2(s));
    }
  });
});

describe('preservación y versionado (servicio)', () => {
  function buildService(profile: any) {
    const prisma: any = {
      brand: { findMany: vi.fn(async () => []) },
      articleNormalizationProfile: {
        findUnique: vi.fn(async () => profile),
        upsert: vi.fn(async ({ create }: any) => ({ id: 'p1', ...create })),
      },
    };
    const service = new MatchingService(prisma, {} as any, {} as any, {
      findProfile: (c: string, p: string) => prisma.articleNormalizationProfile.findUnique({}),
      upsertProfile: (d: any) => prisma.articleNormalizationProfile.upsert({ where: {}, create: d, update: {} }),
      findDecision: vi.fn(),
      createDecision: vi.fn(),
    } as any, {} as any);
    return { service, prisma };
  }

  it('re-normalización v1→v2 conserva original y cambia versión', async () => {
    const { service, prisma } = buildService({
      companyCode: 'AD_TRANS',
      profitArticleCode: 'X1',
      originalDescription: 'Filtro de aceite / DT-466',
      normalizedDescription: 'FILTRO DE ACEITE DT 466',
      normalizationVersion: 'v1',
      brand: null, model: null, partNumber: null, category: null,
      subCategory: null, unit: null, application: null, photoReference: null,
    });
    const out = await service.renormalizeProfile('AD_TRANS', 'X1');
    expect(out.originalDescription).toBe('Filtro de aceite / DT-466');
    expect(out.normalizationVersion).toBe('v2');
    expect(out.normalizedDescription).toBe('FILTRO DE ACEITE DT466');
    expect(JSON.parse(out.tokensJson)).toEqual(['FILTRO', 'DE', 'ACEITE', 'DT466']);
    expect(prisma.articleNormalizationProfile.upsert).toHaveBeenCalled();
  });

  it('perfil ya en v2 no se reescribe silenciosamente', async () => {
    const { service, prisma } = buildService({
      companyCode: 'AD_TRANS', profitArticleCode: 'X1',
      originalDescription: 'A', normalizedDescription: 'A', normalizationVersion: 'v2',
    });
    const out = await service.renormalizeProfile('AD_TRANS', 'X1');
    expect(out.normalizationVersion).toBe('v2');
    expect(prisma.articleNormalizationProfile.upsert).not.toHaveBeenCalled();
  });

  it('sin perfil previo, renormalizar informa en español', async () => {
    const { service } = buildService(null);
    await expect(service.renormalizeProfile('AD_TRANS', 'NOPE')).rejects.toThrow('Sin perfil previo');
  });
});
