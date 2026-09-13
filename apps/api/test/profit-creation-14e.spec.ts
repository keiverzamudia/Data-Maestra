import { describe, it, expect, vi } from 'vitest';
import {
  profitCandidate,
  profitCodePrefix,
  profitSequenceOf,
  buildProfitArticlePayload,
} from '../src/modulos/profit/profit-article.payload';
import { classifyProfitWriteError } from '../src/modulos/profit/profit-write.errors';
import { ProfitArticleCreationService } from '../src/modulos/profit/profit-article-creation.service';
import { REQUIRE_PERMISSION_KEY } from '../src/modulos/autenticacion/require-permission.decorator';
import { SolicitudesController } from '../src/modulos/solicitudes/solicitud.controller';

const INPUT = {
  description: 'TORNILLO HEX',
  articleType: 'C',
  groupCode: 'ACT',
  subgroupCode: 'EQT',
  unitCode: 'UND',
  taxType: '1',
};

const sqlErr = (number: number, message: string) => {
  const e: any = new Error(message);
  e.number = number;
  return e;
};

interface FakeOpts {
  maxSeq?: number;
  exists?: (co: string) => boolean | Promise<boolean>;
  insert?: (p: any) => void | Promise<void>;
  read?: (co: string) => any;
  enabled?: boolean;
}

function fakeEngines(o: FakeOpts = {}) {
  const calls = { exists: 0, insert: 0, read: 0, maxSeq: 0 };
  const existing = new Set<string>();
  const write: any = {
    isWriteEnabled: () => o.enabled ?? true,
    describeTarget: () => {
      if (!(o.enabled ?? true)) throw new Error('Profit write not configured');
      return { server: 'TEST', database: 'TEST' };
    },
    articleExists: async (co: string) => {
      calls.exists++;
      if (o.exists) return o.exists(co);
      return existing.has(co);
    },
    maxSequenceFor: async () => {
      calls.maxSeq++;
      return o.maxSeq ?? 0;
    },
    insertArticle: async (p: any) => {
      calls.insert++;
      if (o.insert) return o.insert(p);
      existing.add(p.co_art);
    },
    readArticle: async (co: string) => {
      calls.read++;
      if (o.read) return o.read(co);
      if (!existing.has(co)) return null;
      // Eco de lo insertado: reconstruir payload esperado mínimo.
      return lastPayload;
    },
  };
  let lastPayload: any = null;
  const origInsert = write.insertArticle;
  write.insertArticle = async (p: any) => {
    try {
      await origInsert(p);
    } catch (e) {
      throw e;
    }
    // Solo lo confirmado como escrito existe y es releíble.
    existing.add(p.co_art);
    lastPayload = { ...p };
  };
  const read: any = {
    articleExists: (co: string) => write.articleExists(co),
    maxSequenceFor: () => write.maxSequenceFor(),
  };
  const engine = new ProfitArticleCreationService(write, read);
  return { engine, calls, existing, setPayload: (p: any) => { lastPayload = p; } };
}

describe('14E helpers puros', () => {
  it('prefijo sin guion y candidato con padding', () => {
    expect(profitCodePrefix('ACT', 'EQT')).toBe('ACTEQT');
    expect(profitCandidate('ACTEQT', 1)).toBe('ACTEQT0001');
  });
  it('sequenceOf solo dentro del prefijo', () => {
    expect(profitSequenceOf('ACTEQT0042', 'ACTEQT')).toBe(42);
    expect(profitSequenceOf('OTRO0001', 'ACTEQT')).toBeNull();
    expect(profitSequenceOf('ACTEQTCAT', 'ACTEQT')).toBeNull();
  });
  it('payload aplica defaults AMBART y une uni_venta=suni_venta', () => {
    const p = buildProfitArticlePayload('ACTEQT0001', INPUT);
    expect(p.uni_venta).toBe('UND');
    expect(p.suni_venta).toBe('UND');
    expect(p.co_cat).toBe('01');
    expect(p.co_prov).toBe('GEN');
    expect(p.tipo_cos).toBe('ULCO');
    expect(buildProfitArticlePayload('X', { ...INPUT, articleType: 'S' }).tipo_cos).toBe('ULOM');
  });
});

describe('14E detector de colisión (estricto)', () => {
  it('2627 + art_co_art es colisión', () => {
    const c = classifyProfitWriteError(sqlErr(2627, "Violation of PRIMARY KEY constraint 'art_co_art'"));
    expect(c.kind).toBe('DUPLICATE_CODE');
    expect(c.retryableAsCollision).toBe(true);
  });
  it('2627 SIN art_co_art NO es colisión', () => {
    const c = classifyProfitWriteError(sqlErr(2627, "Violation of PRIMARY KEY constraint 'X'"));
    expect(c.retryableAsCollision).toBe(false);
  });
  it('2601 NO es colisión de co_art', () => {
    const c = classifyProfitWriteError(sqlErr(2601, 'unique index rowguid'));
    expect(c.kind).toBe('UNKNOWN');
    expect(c.retryableAsCollision).toBe(false);
  });
  it('547 distingue FK de CHECK por texto', () => {
    expect(classifyProfitWriteError(sqlErr(547, 'conflicted with the FOREIGN KEY constraint')).kind).toBe('FK_VIOLATION');
    expect(classifyProfitWriteError(sqlErr(547, 'conflicted with the CHECK constraint')).kind).toBe('CHECK_VIOLATION');
  });
  it('timeout/conexión exigen VERIFY', () => {
    expect(classifyProfitWriteError(sqlErr(-2, 'Timeout expired')).needsVerify).toBe(true);
    const e: any = new Error('socket hang up');
    e.code = 'ESOCKET';
    expect(classifyProfitWriteError(e).needsVerify).toBe(true);
  });
});

describe('14E motor (18 escenarios)', () => {
  it('1. candidate libre → INSERTED y verificado', async () => {
    const { engine } = fakeEngines({ maxSeq: 4 });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.ok).toBe(true);
    expect(r.coArt).toBe('ACTEQT0005');
    expect(r.reconcile).toBe('CREATED_AND_VERIFIED');
  });

  it('2. candidate existente → avanza al siguiente del mismo par', async () => {
    const { engine } = fakeEngines({ maxSeq: 5, exists: (co) => co === 'ACTEQT0006' });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.ok).toBe(true);
    expect(r.coArt).toBe('ACTEQT0007');
  });

  it('3-4. duplicate 2627 reintenta y tiene éxito', async () => {
    let n = 0;
    const { engine, calls } = fakeEngines({
      maxSeq: 0,
      exists: () => false,
      insert: () => {
        n++;
        if (n === 1) throw sqlErr(2627, "Violation of PRIMARY KEY constraint 'art_co_art'");
      },
    });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.ok).toBe(true);
    expect(r.coArt).toBe('ACTEQT0002');
    expect(calls.insert).toBe(2);
  });

  it('5. 2627 persistente agota intentos (ERROR_CODE_ALLOCATION_EXHAUSTED)', async () => {
    const { engine } = fakeEngines({
      maxSeq: 0,
      exists: () => false,
      insert: () => { throw sqlErr(2627, "Violation of PRIMARY KEY constraint 'art_co_art'"); },
    });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('ERROR_CODE_ALLOCATION_EXHAUSTED');
    expect(r.attempts).toHaveLength(10);
  });

  it('6. error FK detiene sin reintentar', async () => {
    const { engine, calls } = fakeEngines({
      maxSeq: 0,
      exists: () => false,
      insert: () => { throw sqlErr(547, 'conflicted with the FOREIGN KEY constraint "FK_art_unidades"'); },
    });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('ERROR_PROFIT_FK_VIOLATION');
    expect(calls.insert).toBe(1);
  });

  it('7. error CHECK detiene sin reintentar', async () => {
    const { engine } = fakeEngines({
      maxSeq: 0,
      exists: () => false,
      insert: () => { throw sqlErr(547, 'conflicted with the CHECK constraint "CK_art_TIPO_IMP"'); },
    });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.errorCode).toBe('ERROR_PROFIT_CHECK_VIOLATION');
  });

  it('8. unidad inválida (trigger) → TRIGGER_REJECT', async () => {
    const { engine } = fakeEngines({
      maxSeq: 0,
      exists: () => false,
      insert: () => { throw sqlErr(50000, "Cannot add or change record. Referential integrity rules require a related record in table 'unidades'"); },
    });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.errorCode).toBe('ERROR_PROFIT_TRIGGER_REJECT');
  });

  it('9. tipo inválido (CHECK CK_art_TIPO)', async () => {
    const { engine } = fakeEngines({
      maxSeq: 0,
      exists: () => false,
      insert: () => { throw sqlErr(547, 'conflicted with the CHECK constraint "CK_art_TIPO"'); },
    });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.errorCode).toBe('ERROR_PROFIT_CHECK_VIOLATION');
  });

  it('10. timeout + VERIFY encuentra fila propia → éxito', async () => {
    const store = new Set<string>();
    // Simula: el INSERT ocurrió pero la respuesta se perdió.
    const { engine } = fakeEngines({
      maxSeq: 0,
      exists: () => false,
      insert: (p: any) => { store.add(p.co_art); throw sqlErr(-2, 'Timeout expired'); },
      read: (co: string) => (store.has(co)
        ? { co_art: co, art_des: 'TORNILLO HEX', tipo: 'C', co_lin: 'ACT', co_subl: 'EQT', uni_venta: 'UND', suni_venta: 'UND', tipo_imp: '1', co_cat: '01', co_color: '01', procedenci: '01', co_prov: 'GEN', tipo_cos: 'ULCO', dis_cen: '' }
        : null),
    });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.ok).toBe(true);
    expect(r.reconcile).toBe('CREATED_AND_VERIFIED');
  });

  it('11. conexión perdida + VERIFY ausente → ambiguo sin segundo INSERT', async () => {
    const { engine, calls } = fakeEngines({
      maxSeq: 0,
      exists: () => false,
      insert: () => {
        const e: any = new Error('socket hang up');
        e.code = 'ESOCKET';
        throw e;
      },
      read: () => null,
    });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('ERROR_PROFIT_AMBIGUOUS');
    expect(calls.insert).toBe(1);
  });

  it('12. VERIFY con fila ajena → RECONCILIATION_ERROR sin reclamar', async () => {
    const { engine } = fakeEngines({
      maxSeq: 0,
      exists: () => false,
      insert: () => { throw sqlErr(-2, 'Timeout expired'); },
      read: () => ({ co_art: 'ACTEQT0001', art_des: 'OTRO ARTICULO', co_lin: 'ACT' }),
    });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.reconcile).toBe('RECONCILIATION_ERROR');
  });

  it('13. idempotencia: un solo INSERT ante timeout', async () => {
    let inserts = 0;
    const store = new Set<string>();
    const { engine } = fakeEngines({
      maxSeq: 0,
      exists: () => false,
      insert: (p: any) => {
        inserts++;
        store.add(p.co_art);
        throw sqlErr(-2, 'Timeout expired');
      },
      read: (co: string) => (store.has(co)
        ? { co_art: co, art_des: 'TORNILLO HEX', tipo: 'C', co_lin: 'ACT', co_subl: 'EQT', uni_venta: 'UND', suni_venta: 'UND', tipo_imp: '1', co_cat: '01', co_color: '01', procedenci: '01', co_prov: 'GEN', tipo_cos: 'ULCO', dis_cen: '' }
        : null),
    });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.ok).toBe(true);
    expect(inserts).toBe(1);
  });

  it('14. reconciliación correcta sin diferencias', async () => {
    const { engine } = fakeEngines({ maxSeq: 9 });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.reconcile).toBe('CREATED_AND_VERIFIED');
    expect(r.differences).toEqual([]);
  });

  it('15. reconciliación con diferencias no oculta nada', async () => {
    const { engine } = fakeEngines({
      maxSeq: 9,
      exists: () => false,
      read: () => ({ co_art: 'ACTEQT0010', art_des: 'TORNILLO HEX', tipo: 'C', co_lin: 'ACT', co_subl: 'EQT', uni_venta: 'UND', suni_venta: 'UND', tipo_imp: '1', co_cat: '01', co_color: '01', procedenci: '01', co_prov: 'GEN', tipo_cos: 'ULCO', dis_cen: 'CTA-999' }),
    });
    const r = await engine.allocateAndInsert({ ...INPUT, disCen: 'CTA-111' });
    expect(r.reconcile).toBe('CREATED_WITH_DIFFERENCES');
    expect(r.differences).toContain('dis_cen');
  });

  it('16. Profit no disponible propaga sin éxito falso', async () => {
    const { engine } = fakeEngines({
      exists: () => { throw new Error('Profit unavailable'); },
    });
    await expect(engine.allocateAndInsert(INPUT)).rejects.toThrow();
  });

  it('17. flag false bloquea disponibilidad', () => {
    const { engine } = fakeEngines({ enabled: false });
    expect(() => engine.assertAvailable()).toThrow();
  });

  it('18. la ruta de creación exige PROFIT.WRITE', () => {
    const perms: string[] = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, SolicitudesController.prototype.profitCreate) ?? [];
    expect(perms).toContain('PROFIT.WRITE');
  });
});
