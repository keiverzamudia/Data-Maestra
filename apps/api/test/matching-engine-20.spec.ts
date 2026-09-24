import { describe, it, expect } from 'vitest';
import { DeterministicMatchEngineV1, ENGINE_VERSION } from '../src/modulos/matching/domain/match-engine';
import type { ArticleMatchingInput } from '../src/modulos/matching/domain/matching-contracts';
import type { ArticleSnapshot } from '../src/modulos/matching/domain/match-engine';

function engineWith(snapshots: ArticleSnapshot[]) {
  return new DeterministicMatchEngineV1({
    listCandidates: async () => snapshots,
  });
}

const snap = (over: Partial<ArticleSnapshot> = {}): ArticleSnapshot => ({
  article: { companyCode: 'AD_TRANS', profitArticleCode: 'FERMIS0662' },
  description: 'FILTRO ACEITE DT466',
  brand: 'INTERNATIONAL',
  model: 'DT466',
  partNumber: 'LF9009',
  category: 'FER',
  subCategory: 'MIS',
  unit: 'UND',
  application: 'CAMION',
  purpose: 'MANTENIMIENTO',
  ...over,
});

const input: ArticleMatchingInput = {
  companyCode: 'AD_TRANS',
  description: 'Filtro de aceite International DT-466',
  purpose: 'MANTENIMIENTO',
  brand: 'INTERNATIONAL',
  model: 'DT466',
  partNumber: 'LF9009',
  category: 'FER',
  subCategory: 'MIS',
  unit: 'UND',
  application: 'CAMION',
};

describe('motor v1 — casos §33', () => {
  it('Caso 1: coincidencia fuerte → COINCIDENCIA ALTA con evidencias', async () => {
    const r = await engineWith([snap()]).findCandidates(input);
    expect(r).toHaveLength(1);
    expect(r[0]!.classification).toBe('HIGH');
    expect(r[0]!.evidence).toEqual(
      expect.arrayContaining(['PART_NUMBER_MATCH', 'MODEL_MATCH', 'BRAND_MATCH', 'DESCRIPTION_SIMILARITY']),
    );
    expect(r[0]!.conflicts).toEqual([]);
    expect(r[0]!.engineVersion).toBe(ENGINE_VERSION);
    expect(r[0]!.explanation).toContain('Se muestra porque');
  });

  it('Caso 2: modelo diferente (DT466 vs DT530) → no ALTA, conflicto/revisión', async () => {
    const r = await engineWith([snap({ model: 'DT530', partNumber: 'OTRO1', description: 'FILTRO ACEITE DT530' })]).findCandidates(input);
    expect(r[0]!.classification).toBe('REVIEW');
    expect(r[0]!.conflicts).toContain('MODEL_CONFLICT');
  });

  it('Caso 3: marca diferente → conflicto de marca', async () => {
    const r = await engineWith([snap({ brand: 'CUMMINS', partNumber: 'OTRO2' })]).findCandidates({
      ...input,
      partNumber: undefined,
      model: undefined,
    });
    expect(r[0]!.conflicts).toContain('BRAND_CONFLICT');
    expect(r[0]!.classification).toBe('REVIEW');
  });

  it('Caso 4: marca ausente en un lado NO es conflicto', async () => {
    const r = await engineWith([snap({ brand: undefined, partNumber: 'OTRO3' })]).findCandidates({
      ...input,
      partNumber: undefined,
      model: undefined,
    });
    expect(r[0]!.conflicts).not.toContain('BRAND_CONFLICT');
  });

  it('Caso 5: mismo número de parte → evidencia fuerte (sin SAME automático)', async () => {
    const r = await engineWith([snap({ description: 'OTRA COSA', brand: undefined, model: undefined, category: undefined, subCategory: undefined, unit: undefined, application: undefined, purpose: undefined })]).findCandidates({
      ...input,
      description: 'EMPAQUE',
      brand: undefined,
      model: undefined,
    });
    expect(r[0]!.evidence).toContain('PART_NUMBER_MATCH');
    expect(r[0]!.classification).not.toBe('HIGH');
  });

  it('Caso 5b: mismo número + categoría incompatible → REVISIÓN', async () => {
    const r = await engineWith([snap({ category: 'ELE' })]).findCandidates(input);
    expect(r[0]!.evidence).toContain('PART_NUMBER_MATCH');
    expect(r[0]!.conflicts).toContain('CATEGORY_CONFLICT');
    expect(r[0]!.classification).toBe('REVIEW');
  });

  it('Caso 6: número de parte diferente y confiable → conflicto', async () => {
    const r = await engineWith([snap({ partNumber: 'P550949' })]).findCandidates(input);
    expect(r[0]!.conflicts).toContain('PART_NUMBER_CONFLICT');
    expect(r[0]!.classification).toBe('REVIEW');
  });

  it('Caso 7: unidades diferentes se detectan (UND vs KG), sin conversiones', async () => {
    const r = await engineWith([snap({ unit: 'KG', partNumber: 'OTRO4' })]).findCandidates({
      ...input,
      partNumber: undefined,
      model: undefined,
    });
    expect(r[0]!.conflicts).toContain('UNIT_CONFLICT');
  });

  it('Caso 8: descripciones equivalentes por V2 (DT-466 vs DT 466)', async () => {
    const r = await engineWith([
      snap({ brand: undefined, model: undefined, partNumber: undefined, category: undefined, subCategory: undefined, unit: undefined, application: undefined, purpose: undefined }),
    ]).findCandidates({
      companyCode: 'AD_TRANS',
      description: 'Filtro aceite DT 466',
    });
    expect(r[0]!.evidence).toContain('DESCRIPTION_SIMILARITY');
  });

  it('Caso 9: mismo código en empresas distintas son artículos distintos', async () => {
    const a = snap({ article: { companyCode: 'AD_TRANS', profitArticleCode: 'FERMIS0662' } });
    const b = snap({ article: { companyCode: 'AD_DIST', profitArticleCode: 'FERMIS0662' } });
    const r = await engineWith([a, b]).findCandidates({ ...input, profitArticleCode: 'OTROCOD' });
    expect(r).toHaveLength(2);
    expect(r[0]!.article.companyCode).not.toBe(r[1]!.article.companyCode);
  });

  it('Caso 12: sin datos suficientes → REVISIÓN o BAJA, nunca inventa', async () => {
    const r = await engineWith([snap({ description: '', brand: undefined, model: undefined, partNumber: undefined })]).findCandidates({
      companyCode: 'AD_TRANS',
      description: '',
    });
    expect(['REVIEW', 'LOW']).toContain(r[0]!.classification);
    const r2 = await engineWith([snap({ description: 'TORNILLO HEXAGONAL M8' })]).findCandidates({
      companyCode: 'AD_TRANS',
      description: 'FILTRO ACEITE DT466',
    });
    expect(['REVIEW', 'LOW']).toContain(r2[0]!.classification);
  });
});

describe('motor v1 — determinismo, orden y preservación', () => {
  const pool = [
    snap({ article: { companyCode: 'AD_DIST', profitArticleCode: 'B' }, description: 'FILTRO ACEITE' }),
    snap({ article: { companyCode: 'AD_TRANS', profitArticleCode: 'A' }, description: 'FILTRO ACEITE DT466' }),
  ];

  it('Caso 34: misma entrada → mismo orden, clasificación y evidencias', async () => {
    const e = engineWith(pool);
    const r1 = await e.findCandidates(input);
    const r2 = await e.findCandidates(input);
    expect(r2).toEqual(r1);
  });

  it('orden: evidencia fuerte primero, desempate determinístico por clave', async () => {
    const e = engineWith(pool);
    const r = await e.findCandidates(input);
    expect(r[0]!.score).toBeGreaterThanOrEqual(r[1]!.score);
  });

  it('Caso 35: el matching no modifica nada (solo lee y calcula)', async () => {
    const before = JSON.parse(JSON.stringify(pool));
    const beforeInput = JSON.parse(JSON.stringify(input));
    await engineWith(pool).findCandidates(input);
    expect(pool).toEqual(before);
    expect(input).toEqual(beforeInput);
  });
});

// FASE P1 — coherencia de señales: lo que antes era "solo suma" ahora también
// puede vetar, y lo que se compara se compara normalizado (no crudo).
describe('motor v1 — FASE P1: conflictos y comparación normalizada', () => {
  it('subgrupo distinto → SUBCATEGORY_CONFLICT (antes era silencioso)', async () => {
    const r = await engineWith([snap({ subCategory: 'ROD', partNumber: 'OTRO5' })]).findCandidates(input);
    expect(r[0]!.conflicts).toContain('SUBCATEGORY_CONFLICT');
    expect(r[0]!.classification).toBe('REVIEW');
  });

  it('subgrupo ausente en un lado NO es conflicto', async () => {
    const r = await engineWith([snap({ subCategory: undefined, partNumber: 'OTRO6' })]).findCandidates(input);
    expect(r[0]!.conflicts).not.toContain('SUBCATEGORY_CONFLICT');
  });

  it('propósito distinto → PURPOSE_CONFLICT (antes solo sumaba +5)', async () => {
    const r = await engineWith([snap({ purpose: 'REPARACION', partNumber: 'OTRO7' })]).findCandidates(input);
    expect(r[0]!.conflicts).toContain('PURPOSE_CONFLICT');
    expect(r[0]!.classification).toBe('REVIEW');
  });

  it('campos estructurados se comparan normalizados: "DT466" vs "dt-466" coincide', async () => {
    const r = await engineWith([
      snap({ model: 'dt-466', brand: 'international', partNumber: undefined, category: undefined, subCategory: undefined, unit: undefined, application: undefined, purpose: undefined }),
    ]).findCandidates({ ...input, partNumber: undefined, model: 'DT466' });
    expect(r[0]!.evidence).toContain('MODEL_MATCH');
    expect(r[0]!.conflicts).not.toContain('MODEL_CONFLICT');
    expect(r[0]!.conflicts).not.toContain('BRAND_CONFLICT');
  });

  it('espacios en códigos no generan falso conflicto: "7J 178" vs "7J178"', async () => {
    const r = await engineWith([
      snap({ partNumber: '7J 178', brand: undefined, model: undefined, category: undefined, subCategory: undefined, unit: undefined, application: undefined, purpose: undefined }),
    ]).findCandidates({ ...input, partNumber: '7J178', model: undefined });
    expect(r[0]!.evidence).toContain('PART_NUMBER_MATCH');
    expect(r[0]!.conflicts).toEqual([]);
  });

  it('explicación honesta: con puntaje 0 no se dice "relación textual débil"', async () => {
    const r = await engineWith([
      snap({
        description: 'PINTURA LATEX BLANCA',
        brand: undefined, model: undefined, partNumber: undefined,
        category: undefined, subCategory: undefined, unit: undefined,
        application: undefined, purpose: undefined,
      }),
    ]).findCandidates({
      companyCode: 'AD_TRANS',
      description: 'TORNILLO HEXAGONAL M8',
    });
    expect(r[0]!.score).toBe(0);
    expect(r[0]!.explanation).toContain('No se encontró ninguna coincidencia demostrable');
    expect(r[0]!.explanation).not.toContain('relación textual débil');
  });

  it('explicación honesta: con evidencia sigue explicando el por qué', async () => {
    const r = await engineWith([snap()]).findCandidates(input);
    expect(r[0]!.explanation).toContain('Se muestra porque');
  });
});
