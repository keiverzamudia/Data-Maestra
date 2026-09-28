import { describe, it, expect } from 'vitest';
import { CORPORATE_CATALOGS, catalogSelectSql, catalogUpdateDescForCompany } from '../src/modulos/profit/corporate-catalogs';
import { compareCatalogRows, buildSyncPlanItem, isPlanExecutable, summarizePlan } from '../src/modulos/profit/corporate-compare';

// ---------------------------------------------------------------------------
// FASE 26.4 — Identidad compuesta (padre, código) en catálogos jerárquicos.
//
// Regla de Profit: la PK de sub_lin es (co_lin, co_subl). El mismo co_subl se
// repite bajo líneas distintas (ELE×4, CON×5, VEH×4…), así que indexar por
// código SOLO emparejaba filas ajenas y bloqueaba en falso sublíneas cuya
// descripción coincidía al 100% (CAMISAS/CAMISAS, LIMPIEZA/LIMPIEZA…).
// Puras: sin I/O, sin SQL, sin Profit.
// ---------------------------------------------------------------------------

const SUB = CORPORATE_CATALOGS['sub_lin'];

describe('FASE 26.4 — la identidad de sub_lin es (línea, código)', () => {
  it('reproduce el bug: código repetido en destino ya no empareja la fila equivocada', () => {
    // Destino tiene CAM bajo dos líneas con descripciones distintas; el
    // estándar solo lo tiene bajo LA2.
    const dest = [
      { code: 'CAM', description: 'CAMISAS MUJER', parent: 'LA1' },
      { code: 'CAM', description: 'CAMISAS', parent: 'LA2' },
    ];
    const standard = [{ code: 'CAM', description: 'CAMISAS', parent: 'LA2' }];

    // Antes: destByCode se quedaba con la PRIMERA fila (LA1) → padre distinto
    // → falso DATOS_DIFERENTES aunque la fila correcta existía y coincidía.
    const diffs = compareCatalogRows('Sublíneas', standard, dest, { parentAware: true });
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.state).toBe('IGUAL');
    expect(diffs[0]!.destValue).toBe('CAMISAS');
    expect(buildSyncPlanItem(diffs[0]!, SUB).operation).toBe('NO_ACTION');
  });

  it('varias líneas con el mismo código: cada par se compara con su propia descripción', () => {
    const dest = [
      { code: 'ELE', description: 'ELECTRICA', parent: 'L1' },
      { code: 'ELE', description: 'ELECTRICOS', parent: 'L2' },
      { code: 'ELE', description: 'ELECTRO', parent: 'L3' },
    ];
    const standard = [
      { code: 'ELE', description: 'ELECTRICA', parent: 'L1' },   // idéntica
      { code: 'ELE', description: 'ELECTRICOS', parent: 'L2' },  // idéntica
      { code: 'ELE', description: 'ELECTRODOTOS', parent: 'L3' }, // solo descripción
    ];
    const diffs = compareCatalogRows('Sublíneas', standard, dest, { parentAware: true });
    expect(diffs.map((d) => d.state)).toEqual(['IGUAL', 'IGUAL', 'DESCRIPCION_DIFERENTE']);
    // Antes: la fila L2 y la L3 se comparaban contra la L1 → ambas bloqueadas.
    expect(diffs.filter((d) => d.state === 'DATOS_DIFERENTES')).toHaveLength(0);
  });

  it('par inexistente en destino → FALTA (crear), aunque el código exista bajo otra línea', () => {
    // AD_TRANS tiene (L2, 01); en destino 01 solo cuelga de L1. Son filas
    // DISTINTAS (PK compuesta): falta crear, no hay nada que "adivinar".
    const dest = [{ code: '01', description: 'GASOL', parent: 'L1' }];
    const standard = [{ code: '01', description: 'NO APLICA', parent: 'L2' }];
    const diffs = compareCatalogRows('Sublíneas', standard, dest, { parentAware: true });
    expect(diffs[0]!.state).toBe('FALTA_EN_DESTINO');
    const item = buildSyncPlanItem(diffs[0]!, SUB);
    expect(item.operation).toBe('INSERT');
    expect(item.safe).toBe(true);
    expect(isPlanExecutable([item])).toBe(true);
  });

  it('el padre del estándar se traduce por equivalencia antes de buscar el par', () => {
    // En destino la línea FER se llama FERRO: sin traducir, (FER, MIS) no
    // existiría y se propondría un duplicado.
    const dest = [{ code: 'MIS', description: 'Misceláneo', parent: 'FERRO' }];
    const standard = [{ code: 'MIS', description: 'Misceláneo', parent: 'FER' }];
    const opts = { parentAware: true, parentEquivalences: new Map([['FER', 'FERRO']]) };

    const conEquivalencia = compareCatalogRows('Sublíneas', standard, dest, opts);
    expect(conEquivalencia[0]!.state).toBe('IGUAL');

    const sinEquivalencia = compareCatalogRows('Sublíneas', standard, dest, { parentAware: true });
    expect(sinEquivalencia[0]!.state).toBe('FALTA_EN_DESTINO');
  });

  it('estándar sin padre → DATOS_DIFERENTES (no hay dónde colgarlo)', () => {
    const dest = [{ code: 'MIS', description: 'Misceláneo', parent: 'FER' }];
    const standard = [{ code: 'MIS', description: 'Misceláneo', parent: '' }];
    const diffs = compareCatalogRows('Sublíneas', standard, dest, { parentAware: true });
    expect(diffs[0]!.state).toBe('DATOS_DIFERENTES');
    expect(buildSyncPlanItem(diffs[0]!, SUB).operation).toBe('BLOCKED');
  });

  it('descripción distinta con el par correcto → DESCRIPCION_DIFERENTE (no bloqueo)', () => {
    const dest = [{ code: 'MAN', description: 'MANGUERA', parent: 'L1' }];
    const standard = [{ code: 'MAN', description: 'MANGUERAS', parent: 'L1' }];
    const diffs = compareCatalogRows('Sublíneas', standard, dest, { parentAware: true });
    expect(diffs[0]!.state).toBe('DESCRIPCION_DIFERENTE');
    // Sin allowDescSync sigue bloqueado (fail-closed, FASE 26.2).
    expect(buildSyncPlanItem(diffs[0]!, SUB).operation).toBe('BLOCKED');
    expect(buildSyncPlanItem(diffs[0]!, SUB, { allowDescSync: true }).operation).toBe('UPDATE_DESCRIPTION');
  });

  it('catálogos SIN columna padre siguen indexando solo por código', () => {
    const dest = [{ code: '01', description: 'COMBUSTIBLE' }];
    const standard = [{ code: '01', description: 'FLETES' }];
    const diffs = compareCatalogRows('Líneas', standard, dest, { parentAware: false });
    expect(diffs[0]!.state).toBe('DESCRIPCION_DIFERENTE');
  });

  it('la equivalencia de código canónico sigue dando EQUIVALENTE con el par correcto', () => {
    const dest = [{ code: 'FERRO', description: 'Ferretería', parent: undefined }];
    const standard = [{ code: 'FER', description: 'Ferretería', parent: undefined }];
    const diffs = compareCatalogRows('Líneas', standard, dest, { equivalences: new Map([['FER', 'FERRO']]) });
    expect(diffs[0]!.state).toBe('EQUIVALENTE');
    expect(diffs[0]!.destCode).toBe('FERRO');
    expect(buildSyncPlanItem(diffs[0]!, CORPORATE_CATALOGS['lin_art']).operation).toBe('NO_ACTION');
  });

  it('cada par que falta se cuenta como faltante, no como bloqueo', () => {
    const dest = [{ code: '01', description: 'GASOL', parent: 'L1' }];
    const standard = [
      { code: '01', description: 'NO APLICA', parent: 'L2' },
      { code: '01', description: 'FLETES', parent: 'L3' },
      { code: '01', description: 'GASOL', parent: 'L1' },
    ];
    const items = compareCatalogRows('Sublíneas', standard, dest, { parentAware: true })
      .map((d) => buildSyncPlanItem(d, SUB));
    const s = summarizePlan(items);
    expect(s.bloqueados).toBe(0);
    expect(s.faltantes).toBe(2);
    expect(s.iguales).toBe(1);
    expect(isPlanExecutable(items)).toBe(true);
  });
});

describe('FASE 26.4 — el UPDATE de descripción no puede cruzar líneas', () => {
  it('sub_lin: WHERE por (co_subl, co_lin) — nunca solo por código', () => {
    const sql = catalogUpdateDescForCompany(SUB, 'AD_DISAY');
    expect(sql).toBe(
      'UPDATE [AD_DISAY].dbo.[sub_lin] SET subl_des = @c1 '
      + 'WHERE LTRIM(RTRIM(co_subl)) = LTRIM(RTRIM(@c0)) AND LTRIM(RTRIM(co_lin)) = LTRIM(RTRIM(@c2))',
    );
    // Sin el AND por co_lin se reescribirían TODAS las líneas que repitan el
    // código (corrupción masiva del destino).
    expect(sql).toContain('co_lin');
  });

  it('catálogos planos no ganan una cláusula de padre', () => {
    expect(catalogUpdateDescForCompany(CORPORATE_CATALOGS['lin_art'], 'AD_DISAY'))
      .toBe('UPDATE [AD_DISAY].dbo.[lin_art] SET lin_des = @c1 WHERE LTRIM(RTRIM(co_lin)) = LTRIM(RTRIM(@c0))');
    expect(catalogUpdateDescForCompany(CORPORATE_CATALOGS['unidades'], 'AD_DISAY')).not.toContain('co_lin');
  });

  it('la lectura ordena por línea y sublínea (los repetidos quedan deterministas)', () => {
    expect(catalogSelectSql(SUB).sql).toContain('ORDER BY co_lin, co_subl');
    expect(catalogSelectSql(CORPORATE_CATALOGS['lin_art']).sql).toContain('ORDER BY 1');
  });
});
