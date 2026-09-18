import { describe, it, expect } from 'vitest';
import {
  getMatchDecisionLabel,
  getMatchClassificationLabel,
  getMatchEvidenceLabel,
  getMatchConflictLabel,
  getMatchEngineStatusLabel,
  getMatchFieldLabel,
} from './presentacion';

// FASE 19 — Todo lo visible del dominio matching debe estar en español.
// Los códigos internos (SAME, HIGH, DESCRIPTION_SIMILARITY, …) no cambian.
describe('Etiquetas en español del dominio matching', () => {
  it('decisiones', () => {
    expect(getMatchDecisionLabel('SAME')).toBe('Mismo artículo');
    expect(getMatchDecisionLabel('DIFFERENT')).toBe('Artículos diferentes');
    expect(getMatchDecisionLabel('REVIEW')).toBe('Requiere revisión');
  });

  it('clasificaciones', () => {
    expect(getMatchClassificationLabel('HIGH')).toBe('Coincidencia alta');
    expect(getMatchClassificationLabel('MEDIUM')).toBe('Coincidencia media');
    expect(getMatchClassificationLabel('LOW')).toBe('Coincidencia baja');
  });

  it('evidencias y conflictos', () => {
    expect(getMatchEvidenceLabel('DESCRIPTION_SIMILARITY')).toBe('Descripción similar');
    expect(getMatchEvidenceLabel('BRAND_MATCH')).toBe('Marca coincidente');
    expect(getMatchEvidenceLabel('MODEL_MATCH')).toBe('Modelo coincidente');
    expect(getMatchEvidenceLabel('PART_NUMBER_MATCH')).toBe('Número de parte coincidente');
    expect(getMatchEvidenceLabel('CATEGORY_MATCH')).toBe('Categoría coincidente');
    expect(getMatchEvidenceLabel('APPLICATION_MATCH')).toBe('Aplicación compatible');
    expect(getMatchEvidenceLabel('PURPOSE_MATCH')).toBe('Propósito compatible');
    expect(getMatchEvidenceLabel('PHOTO_SIMILARITY')).toBe('Imagen similar');
    expect(getMatchConflictLabel('BRAND_CONFLICT')).toBe('Conflicto de marca');
    expect(getMatchConflictLabel('MODEL_CONFLICT')).toBe('Conflicto de modelo');
    expect(getMatchConflictLabel('PART_NUMBER_CONFLICT')).toBe('Conflicto de número de parte');
    expect(getMatchConflictLabel('CATEGORY_CONFLICT')).toBe('Conflicto de categoría');
    expect(getMatchConflictLabel('UNIT_CONFLICT')).toBe('Conflicto de unidad');
    expect(getMatchConflictLabel('APPLICATION_CONFLICT')).toBe('Conflicto de aplicación');
  });

  it('estado del motor y campos', () => {
    expect(getMatchEngineStatusLabel('NOT_IMPLEMENTED')).toBe('Función en preparación');
    expect(getMatchFieldLabel('normalizedDescription')).toBe('Descripción normalizada');
    expect(getMatchFieldLabel('detectedFeatures')).toBe('Características detectadas');
    expect(getMatchFieldLabel('partNumber')).toBe('Número de parte');
  });

  it('ninguna etiqueta visible contiene inglés técnico crudo', () => {
    const labels = [
      getMatchDecisionLabel('SAME'),
      getMatchClassificationLabel('HIGH'),
      getMatchEvidenceLabel('DESCRIPTION_SIMILARITY'),
      getMatchConflictLabel('BRAND_CONFLICT'),
      getMatchEngineStatusLabel('NOT_IMPLEMENTED'),
    ];
    for (const l of labels) {
      expect(l).not.toMatch(/MATCH|CONFLICT|REVIEW|NOT_IMPLEMENTED/);
    }
  });
});
