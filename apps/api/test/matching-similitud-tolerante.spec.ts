import { describe, it, expect } from 'vitest';
import {
  DeterministicMatchEngineV1,
  comparePair,
  descriptionTokens,
  tolerantSimilarity,
} from '../src/modulos/matching/domain/match-engine';
import { MATCH_TUNING } from '../src/modulos/matching/domain/match-tuning';
import type { ArticleSnapshot } from '../src/modulos/matching/domain/match-engine';

/**
 * Similitud tolerante — UNA sola definición de "parecerse".
 *
 * Regresión real: "vaso" mostraba CAJA DE PASO / LLAVE DE PASO y un FARO
 * "0/100" mientras existían VASO / JUEGO DE VASOS / VASOS CONICOS. Dos
 * bugs encadenados:
 *  1. el scoring usaba Jaccard de unión con umbral 0,5 → "vaso" vs
 *     "JUEGO DE VASOS" = 1/3 = 0,33 → nunca había evidencia textual;
 *  2. el recall tolerante permitía 1 edición en tokens de 4 letras →
 *     VASO ↔ PASO (distancia 1) entraban como "parecidos".
 *
 * Reglas a proteger:
 *  1. `tolerantSimilarity` es cobertura de la consulta con el MISMO
 *     solape que el recall (subcadena/prefijo/fuzzy acotado);
 *  2. PASO nunca se solapa con VASO (edición prohibida en 4–5 letras);
 *  3. los pesos y umbrales viven en MATCH_TUNING, congelados (§33);
 *  4. score 0 + evidencia vacía = sin coincidencia demostrable.
 */

const snap = (description: string, over: Partial<ArticleSnapshot> = {}): ArticleSnapshot => ({
  article: { companyCode: 'AD_TRANS', profitArticleCode: `COD-${description.slice(0, 6)}` },
  description,
  ...over,
});

describe('tolerantSimilarity — cobertura tolerante de la consulta', () => {
  it('"vaso" cubre por completo a la familia VASOS', () => {
    const q = descriptionTokens('vaso');
    expect(tolerantSimilarity(q, descriptionTokens('VASO'))).toBe(1);
    expect(tolerantSimilarity(q, descriptionTokens('JUEGO DE VASOS'))).toBe(1);
    expect(tolerantSimilarity(q, descriptionTokens('VASOS CONICOS'))).toBe(1);
    expect(tolerantSimilarity(q, descriptionTokens('DISPENSADOR VASOS PLASTICOS'))).toBe(1);
  });

  it('"vaso" NO cubre al ruido de PASO', () => {
    const q = descriptionTokens('vaso');
    expect(tolerantSimilarity(q, descriptionTokens('CAJA DE PASO 1/2'))).toBe(0);
    expect(tolerantSimilarity(q, descriptionTokens('LLAVE DE PASO 3/4'))).toBe(0);
    expect(tolerantSimilarity(q, descriptionTokens('FARO DERECHO DE CAPOT'))).toBe(0);
  });

  it('consultas multi-palabra: cubre lo pedido y no inventa', () => {
    expect(tolerantSimilarity(
      descriptionTokens('filtro aceite'),
      descriptionTokens('FILTRO ACEITE DT466'),
    )).toBe(1);
    // Un token compartido de 3 no basta para 3 pedidos (umbral 0,5).
    const diluida = tolerantSimilarity(
      descriptionTokens('filtro aceite motor'),
      descriptionTokens('FILTRO DE AIRE'),
    );
    expect(diluida).toBeCloseTo(1 / 3, 5);
    expect(diluida).toBeLessThan(MATCH_TUNING.description.minSimilarity);
  });

  it('matching 1:1: un token del perfil no cubre varios de la consulta', () => {
    // '466' y 'DT466' apuntan al MISMO token del perfil: sin emparejamiento
    // 1:1, DT466 cubriría dos pedidos a la vez y falsearía la similitud.
    const sim = tolerantSimilarity(new Set(['DT466', '466']), new Set(['DT466']));
    expect(sim).toBeCloseTo(1 / 2, 5);
  });

  it('conjuntos vacíos → 0 (sin evidencia, no falso positivo)', () => {
    expect(tolerantSimilarity(new Set<string>(), descriptionTokens('VASO'))).toBe(0);
    expect(tolerantSimilarity(descriptionTokens('VASO'), new Set<string>())).toBe(0);
  });
});

describe('comparePair — el scoring reconoce lo que el recall dejó pasar', () => {
  it('"vaso" vs "JUEGO DE VASOS": evidencia real y puntaje > 0', () => {
    const c = comparePair(
      { companyCode: 'AD_TRANS', description: 'vaso' },
      snap('JUEGO DE VASOS'),
    )!;
    expect(c.evidence).toContain('DESCRIPTION_SIMILARITY');
    expect(c.score).toBe(Math.round(1 * MATCH_TUNING.description.scale));
    expect(c.score).toBeGreaterThanOrEqual(MATCH_TUNING.classification.low);
    expect(c.conflicts).toEqual([]);
    expect(c.explanation).toContain('la descripción es similar');
  });

  it('"vaso" vs "CAJA DE PASO": score 0 y sin evidencia (el servicio lo filtra)', () => {
    const c = comparePair(
      { companyCode: 'AD_TRANS', description: 'vaso' },
      snap('CAJA DE PASO 1/2 PVC'),
    )!;
    expect(c.score).toBe(0);
    expect(c.evidence).toEqual([]);
    expect(c.explanation).toContain('No se encontró ninguna coincidencia demostrable');
  });

  it('el motor ordena lo real primero aunque no filtra (filtra el servicio)', async () => {
    const real = snap('JUEGO DE VASOS', { article: { companyCode: 'AD_TRANS', profitArticleCode: 'B' } });
    const ruido = snap('CAJA DE PASO', { article: { companyCode: 'AD_TRANS', profitArticleCode: 'A' } });
    const engine = new DeterministicMatchEngineV1({
      listCandidates: async () => [ruido, real],
    });
    const r = await engine.findCandidates({ companyCode: 'AD_TRANS', description: 'vaso' });
    expect(r[0]!.article.profitArticleCode).toBe('B');
    expect(r[0]!.score).toBeGreaterThan(r[1]!.score);
  });
});

describe('MATCH_TUNING — pesos y umbrales congelados (§33, sin hardcodeo)', () => {
  it('valores vigentes de la estrategia de importancia', () => {
    expect(MATCH_TUNING.weights).toEqual({
      partNumber: 40,
      model: 25,
      brand: 15,
      category: 8,
      subCategory: 6,
      unit: 5,
      application: 5,
      purpose: 5,
    });
    expect(MATCH_TUNING.description).toEqual({ minSimilarity: 0.5, scale: 20 });
    expect(MATCH_TUNING.classification).toEqual({ high: 65, medium: 35, low: 12 });
    expect(Object.isFrozen(MATCH_TUNING)).toBe(true);
    expect(Object.isFrozen(MATCH_TUNING.weights)).toBe(true);
  });

  it('el peso del número de parte se aplica tal cual en el motor', () => {
    const c = comparePair(
      { companyCode: 'AD_TRANS', description: '', partNumber: 'LF9009' },
      { article: { companyCode: 'AD_TRANS', profitArticleCode: 'X1' }, description: '', partNumber: 'LF9009' },
    )!;
    expect(c.score).toBe(MATCH_TUNING.weights.partNumber);
    expect(c.evidence).toEqual(['PART_NUMBER_MATCH']);
  });

  it('la tolerancia edita solo en tokens largos (config leída por el recall)', () => {
    expect(MATCH_TUNING.tolerance.minLengthExact).toBe(3);
    expect(MATCH_TUNING.tolerance.editMinLength1).toBe(6);
    expect(MATCH_TUNING.tolerance.editMinLength2).toBe(8);
  });
});
