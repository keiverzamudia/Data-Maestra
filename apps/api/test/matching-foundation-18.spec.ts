import { describe, it, expect } from 'vitest';
import { normalizeText, NORMALIZATION_VERSION } from '../src/modulos/matching/domain/text-normalizer';
import {
  formatArticleId,
  sameArticle,
  pairKey,
  normalizePair,
} from '../src/modulos/matching/domain/article-identity';
import { DeterministicNormalizerV1 } from '../src/modulos/matching/domain/matching-contracts';

describe('normalizador v1 (determinístico)', () => {
  it('mayúsculas y espacios', () => {
    expect(normalizeText('  Tornillo   Hexagonal ')).toBe('TORNILLO HEXAGONAL');
  });

  it('acentos fuera', () => {
    expect(normalizeText('válvulá de admisión')).toBe('VALVULA DE ADMISION');
  });

  it('puntuación y separadores a espacios', () => {
    expect(normalizeText('Filtro, aceite (motor); 7J-1788439/813961.')).toBe('FILTRO ACEITE MOTOR 7J 1788439 813961');
  });

  it('entradas vacías/null según contrato (nunca lanza)', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
    expect(normalizeText('   ')).toBe('');
  });

  it('idempotencia: normalize(normalize(x)) === normalize(x)', () => {
    const samples = ['  Válvula, Admisión (M8x30)  ', 'FILTRO  ACEITE', '7J-1788439813961', ''];
    for (const s of samples) {
      expect(normalizeText(normalizeText(s))).toBe(normalizeText(s));
    }
  });

  it('versión fijada y expuesta', () => {
    expect(NORMALIZATION_VERSION).toBe('v1');
    const out = new DeterministicNormalizerV1().normalize({ companyCode: 'AD_TRANS', description: ' x ' });
    expect(out.normalizationVersion).toBe('v1');
    expect(out.normalizedDescription).toBe('X');
  });
});

describe('identidad del artículo (companyCode + profitArticleCode)', () => {
  it('AD_TRANS:FERMIS0662 difiere técnicamente de AD_DIST:FERMIS0662', () => {
    const a = { companyCode: 'AD_TRANS', profitArticleCode: 'FERMIS0662' };
    const b = { companyCode: 'AD_DIST', profitArticleCode: 'FERMIS0662' };
    expect(sameArticle(a, b)).toBe(false);
    expect(formatArticleId(a)).toBe('AD_TRANS:FERMIS0662');
    expect(sameArticle(a, { ...a })).toBe(true);
  });

  it('A-B y B-A producen la misma pareja normalizada', () => {
    const a = { companyCode: 'AD_TRANS', profitArticleCode: 'FERMIS0662' };
    const b = { companyCode: 'AD_DIST', profitArticleCode: 'FERMIS0662' };
    expect(pairKey(a, b)).toBe(pairKey(b, a));
    const n1 = normalizePair(a, b);
    const n2 = normalizePair(b, a);
    expect(n1).toEqual(n2);
    expect(formatArticleId(n1.first) <= formatArticleId(n1.second)).toBe(true);
  });
});
