import { describe, it, expect } from 'vitest';
import {
  buildProfitArticlePayload,
  buildInsertStatement,
  type ProfitArticleInput,
} from '../src/modulos/profit/profit-article.payload';

const BASE: ProfitArticleInput = {
  description: 'TORNILLO HEX',
  articleType: 'C',
  groupCode: 'FER',
  subgroupCode: 'MIS',
  unitCode: 'UND',
  taxType: '1',
  integrationUser: 'DM',
};

describe('FASE 24.2 payload 19 columnas (mocks, sin INSERT real)', () => {
  it('1. artículo con modelo y referencia llegan a Profit', () => {
    const p = buildProfitArticlePayload('FERMIS0001', { ...BASE, model: 'DT466', ref: 'LF9009' });
    expect(p.modelo).toBe('DT466');
    expect(p.ref).toBe('LF9009');
    const st = buildInsertStatement(p);
    expect(st.params.find((x) => x.name === 'modelo')!.value).toBe('DT466');
    expect(st.params.find((x) => x.name === 'ref')!.value).toBe('LF9009');
  });

  it('2. artículo sin modelo queda vacío (sin inventar)', () => {
    const p = buildProfitArticlePayload('FERMIS0001', { ...BASE, ref: 'LF9009' });
    expect(p.modelo).toBe('');
    expect(p.ref).toBe('LF9009');
  });

  it('3. artículo sin referencia queda vacío (sin inventar)', () => {
    const p = buildProfitArticlePayload('FERMIS0001', { ...BASE, model: 'DT466' });
    expect(p.modelo).toBe('DT466');
    expect(p.ref).toBe('');
  });

  it('4. artículo sin modelo ni referencia queda vacío', () => {
    const p = buildProfitArticlePayload('FERMIS0001', BASE);
    expect(p.modelo).toBe('');
    expect(p.ref).toBe('');
  });

  it('5. UND → uni_compra UND; co_sucu automático 01', () => {
    const p = buildProfitArticlePayload('FERMIS0001', BASE);
    expect(p.uni_venta).toBe('UND');
    expect(p.suni_venta).toBe('UND');
    expect(p.uni_compra).toBe('UND');
    expect(p.co_sucu).toBe('01');
    const st = buildInsertStatement(p);
    expect(st.params.find((x) => x.name === 'uni_compra')!.value).toBe('UND');
    expect(st.params.find((x) => x.name === 'co_sucu')!.value).toBe('01');
  });

  it('6. co_us_in siempre DM desde el motor (nunca del usuario)', () => {
    const p = buildProfitArticlePayload('FERMIS0001', BASE);
    expect(p.co_us_in).toBe('DM');
    const hostile = buildProfitArticlePayload('FERMIS0001', { ...BASE, integrationUser: 'XX' });
    expect(hostile.co_us_in).toBe('XX');
  });

  it('7. no se envían fechas manuales (payload sin fecha_reg/fe_us_*)', () => {
    const p = buildProfitArticlePayload('FERMIS0001', { ...BASE, model: 'M', ref: 'R' });
    const st = buildInsertStatement(p);
    const names = st.params.map((x) => x.name);
    expect(names).not.toContain('fecha_reg');
    expect(names).not.toContain('fe_us_in');
    expect(names).not.toContain('fe_us_mo');
    expect(names).not.toContain('fe_us_el');
    expect('fecha_reg' in p).toBe(false);
  });

  it('8. modelo/ref se recortan a 20 caracteres (char Profit)', () => {
    const p = buildProfitArticlePayload('X', { ...BASE, model: 'M'.repeat(30), ref: 'R'.repeat(30) });
    expect(p.modelo).toHaveLength(20);
    expect(p.ref).toHaveLength(20);
  });
});
