import { describe, it, expect } from 'vitest';
import {
  applyFirstPage,
  applyNextPage,
  dedupeByCode,
  initialAccountList,
  PAGE_SIZE,
} from './account-pages';

const a = (code: string) => ({ code, description: `d-${code}` });
const page = (from: number, n = PAGE_SIZE) =>
  Array.from({ length: n }, (_, i) => a(`c${String(from + i).padStart(3, '0')}`));

describe('account-pages (Fase 8E.6.1)', () => {
  it('1. no duplica códigos al acumular la misma página dos veces', () => {
    const s0 = applyFirstPage(initialAccountList(), 'inv', page(0), 1);
    // segunda entrega de la misma página: el offset ya avanzó, se descarta
    const s1 = applyNextPage(s0, page(0), 0, 1);
    expect(s1).toBe(s0);
    const codes = s1.items.map(i => i.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('2. primera página: 20 registros', () => {
    const s = applyFirstPage(initialAccountList(), '', page(0), 1);
    expect(s.items).toHaveLength(20);
    expect(s.nextOffset).toBe(20);
    expect(s.hasMore).toBe(true);
    expect(s.generation).toBe(1);
  });

  it('3. segunda página se agrega sin repetir ni perder', () => {
    const s0 = applyFirstPage(initialAccountList(), '', page(0), 1);
    const s1 = applyNextPage(s0, page(20), 20, 1);
    expect(s1.items).toHaveLength(40);
    expect(s1.nextOffset).toBe(40);
    expect(s1.items[19]!.code).toBe('c019');
    expect(s1.items[20]!.code).toBe('c020');
  });

  it('4. cambio de búsqueda reinicia items, offset y estado', () => {
    const s0 = applyFirstPage(initialAccountList(), 'inv', page(0), 1);
    const s1 = applyNextPage(s0, page(20), 20, 1);
    expect(s1.items).toHaveLength(40);
    const s2 = applyFirstPage(s1, 'dif', page(100, 5), 2);
    expect(s2.items).toHaveLength(5);
    expect(s2.nextOffset).toBe(5);
    expect(s2.hasMore).toBe(false);
    expect(s2.query).toBe('dif');
    expect(s2.generation).toBe(2);
  });

  it('5/6. búsqueda por código y por nombre (contrato de items)', () => {
    const rows = [a('1.1.02.01.01.003'), a('1.1.04.03.01.002')];
    const s = applyFirstPage(initialAccountList(), 'diferencia', rows, 1);
    expect(s.items[0]).toEqual({ code: '1.1.02.01.01.003', description: 'd-1.1.02.01.01.003' });
  });

  it('7. no mezcla resultados de búsquedas anteriores (respuesta tardía)', () => {
    const s0 = applyFirstPage(initialAccountList(), 'inv', page(0), 2);
    // llega tarde una página de la generación anterior con otro contenido
    const s1 = applyNextPage(s0, page(500), 20, 1);
    expect(s1).toBe(s0);
    expect(s1.items).toHaveLength(20);
  });

  it('8. selección: el código identifica al registro (key estable)', () => {
    const s = applyFirstPage(initialAccountList(), '', page(0), 1);
    const codes = s.items.map(i => i.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('descarta append con offset obsoleto (evita huecos y solapes)', () => {
    const s0 = applyFirstPage(initialAccountList(), 'inv', page(0), 1);
    const s1 = applyNextPage(s0, page(40), 40, 1); // offset incorrecto
    expect(s1).toBe(s0);
  });

  it('dedupe conserva orden y primera ocurrencia', () => {
    expect(dedupeByCode([a('x'), a('y'), a('x')])).toEqual([a('x'), a('y')]);
  });

  it('última página parcial cierra hasMore', () => {
    const s0 = applyFirstPage(initialAccountList(), '', page(0), 1);
    const s1 = applyNextPage(s0, page(20, 7), 20, 1);
    expect(s1.items).toHaveLength(27);
    expect(s1.hasMore).toBe(false);
  });
});
