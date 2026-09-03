import { describe, it, expect } from 'vitest';
import { serializarDis, deserializarDis } from '../src/modulos/contabilidad/dis.utils';

describe('serializarDis', () => {
  it('1. vacío → <DIS></DIS>', () => {
    expect(serializarDis([])).toBe('<DIS></DIS>');
    expect(serializarDis({})).toBe('<DIS></DIS>');
  });

  it('2. solo c1', () => {
    expect(serializarDis([{ position: 1, code: '1.2.05.02.06.001' }])).toBe('<DIS>{c1:1.2.05.02.06.001}</DIS>');
  });

  it('3. solo c7', () => {
    expect(serializarDis({ c7: '1.1.04.01.01.001' })).toBe('<DIS>{c7:1.1.04.01.01.001}</DIS>');
  });

  it('4. c1+c7', () => {
    expect(
      serializarDis([
        { position: 1, code: '1.2.05.02.06.001' },
        { position: 7, code: '1.1.04.01.01.001' },
      ]),
    ).toBe('<DIS>{c1:1.2.05.02.06.001}{c7:1.1.04.01.01.001}</DIS>');
  });

  it('5. c1+c2+c3', () => {
    expect(
      serializarDis({ c1: '1.1.04.01.01.001', c2: '1.1.04.01.01.001', c3: '4.1.01.03.01.001' }),
    ).toBe('<DIS>{c1:1.1.04.01.01.001}{c2:1.1.04.01.01.001}{c3:4.1.01.03.01.001}</DIS>');
  });

  it('6. c9', () => {
    expect(serializarDis([{ position: 9, code: '7.1.04.01.02.001' }])).toBe('<DIS>{c9:7.1.04.01.02.001}</DIS>');
  });

  it('7. c10', () => {
    expect(serializarDis([{ position: 10, code: '7.1.20.01.01.001' }])).toBe('<DIS>{c10:7.1.20.01.01.001}</DIS>');
  });

  it('8. c1+c9+c10', () => {
    expect(
      serializarDis([
        { position: 10, code: '7.1.20.01.01.001' },
        { position: 9, code: '7.1.04.01.02.001' },
        { position: 1, code: '1.2.05.02.06.001' },
      ]),
    ).toBe('<DIS>{c1:1.2.05.02.06.001}{c9:7.1.04.01.02.001}{c10:7.1.20.01.01.001}</DIS>');
  });

  it('9. posiciones desordenadas se ordenan c1→c10', () => {
    expect(
      serializarDis([
        { position: 7, code: '1.1.04.01.01.001' },
        { position: 1, code: '1.2.05.02.06.001' },
      ]),
    ).toBe('<DIS>{c1:1.2.05.02.06.001}{c7:1.1.04.01.01.001}</DIS>');
  });

  it('10. posición inválida lanza (c11)', () => {
    expect(() => serializarDis({ c11: '1.1.04.01.01.001' } as any)).toThrow(/c1\.\.c10/);
    expect(() => serializarDis([{ position: 11, code: 'x' } as any])).toThrow(/1\.\.10/);
  });

  it('omite posiciones vacías y conserva ceros/puntos', () => {
    expect(serializarDis({ c1: '1.2.05.02.06.001', c2: '', c7: '1.1.04.01.01.001' })).toBe(
      '<DIS>{c1:1.2.05.02.06.001}{c7:1.1.04.01.01.001}</DIS>',
    );
  });

  it('rechaza duplicados de posición', () => {
    expect(() =>
      serializarDis([
        { position: 1, code: 'a' },
        { position: 1, code: 'b' },
      ]),
    ).toThrow(/duplicada/);
  });
});

describe('deserializarDis', () => {
  it('vacío → {}', () => {
    expect(deserializarDis('<DIS></DIS>')).toEqual({});
  });

  it('una posición', () => {
    expect(deserializarDis('<DIS>{c1:1.2.05.02.06.001}</DIS>')).toEqual({ c1: '1.2.05.02.06.001' });
  });

  it('varias no consecutivas + c9 + c10', () => {
    expect(
      deserializarDis('<DIS>{c1:1.2.05.02.06.001}{c7:1.1.04.01.01.001}{c9:7.1.04.01.02.001}{c10:7.1.20.01.01.001}</DIS>'),
    ).toEqual({
      c1: '1.2.05.02.06.001',
      c7: '1.1.04.01.01.001',
      c9: '7.1.04.01.02.001',
      c10: '7.1.20.01.01.001',
    });
  });

  it('round-trip serializar→deserializar', () => {
    const dis = '<DIS>{c1:1.2.05.02.06.001}{c7:1.1.04.01.01.001}</DIS>';
    expect(serializarDis(deserializarDis(dis) as any)).toBe(dis);
  });

  it('rechaza c11 en lugar de aceptarla silenciosamente', () => {
    expect(() => deserializarDis('<DIS>{c11:1.1.04.01.01.001}</DIS>')).toThrow(/inválida/);
  });

  it('rechaza formato sin <DIS>', () => {
    expect(() => deserializarDis('{c1:x}')).toThrow(/<DIS>/);
  });
});
