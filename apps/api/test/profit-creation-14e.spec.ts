import { describe, it, expect, vi } from 'vitest';
import {
  profitCandidate,
  profitCodePrefix,
  profitSequenceOf,
  buildProfitArticlePayload,
  buildInsertStatement,
} from '../src/modulos/profit/profit-article.payload';
import { classifyProfitWriteError } from '../src/modulos/profit/profit-write.errors';
import { ProfitArticleCreationService } from '../src/modulos/profit/profit-article-creation.service';
import { ProfitWriteAdapterService } from '../src/modulos/profit/profit-write.adapter';
import { REQUIRE_PERMISSION_KEY } from '../src/modulos/autenticacion/require-permission.decorator';
import { ClassifyRequestDto } from '../src/modulos/solicitudes/dto/classify-request.dto';
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
  /** Código de integración configurado (default 'DM' = configurado). */
  integrationUser?: string | null;
  rows?: Record<string, any>;
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
    getArticleForVerify: async (co: string) => {
      if (o.read) return o.read(co);
      if (o.rows && co in o.rows) return o.rows[co];
      if (!existing.has(co)) return null;
      return lastPayload;
    },
  };
  const engine = new ProfitArticleCreationService(write, read, {
    get: (k: string) => (k === 'PROFIT_INTEGRATION_USER_CODE' ? (o.integrationUser === null ? undefined : (o.integrationUser ?? 'DM')) : undefined),
  });
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

  it('14K.5: buildInsertStatement con 15 columnas y dis_cen VARCHAR(8000)', () => {
    const p = buildProfitArticlePayload('ACTEQT0001', INPUT);
    const st = buildInsertStatement(p);
    expect(st.sql).toContain('INSERT INTO dbo.art');
    expect(st.params).toHaveLength(15);
    const names = st.params.map((x) => x.name);
    expect(names).toEqual(['co_art', 'art_des', 'tipo', 'co_lin', 'co_subl', 'uni_venta', 'suni_venta', 'tipo_imp', 'co_cat', 'co_color', 'procedenci', 'co_prov', 'tipo_cos', 'dis_cen', 'co_us_in']);
    for (const n of names) {
      expect(st.sql).toContain('@' + n);
    }
    const dis = st.params.find((x) => x.name === 'dis_cen')!;
    expect(dis.kind).toBe('varchar');
    expect(dis.size).toBe(8000);
    expect(dis.value).toBe('');
    expect(st.params.some((x) => x.kind === 'text')).toBe(false);
    const us = st.params.find((x) => x.name === 'co_us_in')!;
    expect(us.kind).toBe('char');
    expect(us.size).toBe(6);
  });

  it('payload fija co_us_in desde input.integrationUser (vacío si ausente)', () => {
    expect(buildProfitArticlePayload('X', INPUT).co_us_in).toBe('');
    expect(buildProfitArticlePayload('X', { ...INPUT, integrationUser: 'DM' }).co_us_in).toBe('DM');
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

  it('14K.3: EREQUEST genérico sin evidencia de timeout NO es ambiguo', () => {
    const e: any = new Error('[Microsoft][ODBC Driver 18 for SQL Server][SQL Server]Los tipos de datos text, ntext e image no son válidos para las variables locales.');
    e.code = 'EREQUEST';
    const c = classifyProfitWriteError(e);
    expect(c.kind).toBe('UNKNOWN');
    expect(c.needsVerify).toBe(false);
    expect(c.retryableAsCollision).toBe(false);
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
        ? { co_art: co, art_des: 'TORNILLO HEX', tipo: 'C', co_lin: 'ACT', co_subl: 'EQT', uni_venta: 'UND', suni_venta: 'UND', tipo_imp: '1', co_cat: '01', co_color: '01', procedenci: '01', co_prov: 'GEN', tipo_cos: 'ULCO', dis_cen: '', co_us_in: 'DM' }
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
        ? { co_art: co, art_des: 'TORNILLO HEX', tipo: 'C', co_lin: 'ACT', co_subl: 'EQT', uni_venta: 'UND', suni_venta: 'UND', tipo_imp: '1', co_cat: '01', co_color: '01', procedenci: '01', co_prov: 'GEN', tipo_cos: 'ULCO', dis_cen: '', co_us_in: 'DM' }
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
      read: () => ({ co_art: 'ACTEQT0010', art_des: 'TORNILLO HEX', tipo: 'C', co_lin: 'ACT', co_subl: 'EQT', uni_venta: 'UND', suni_venta: 'UND', tipo_imp: '1', co_cat: '01', co_color: '01', procedenci: '01', co_prov: 'GEN', tipo_cos: 'ULCO', dis_cen: 'CTA-999', co_us_in: 'DM' }),
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

  it('14K.5: existente con nuestros datos → ALREADY_REGISTERED sin INSERT', async () => {
    let inserts = 0;
    const { engine } = fakeEngines({
      maxSeq: 0,
      exists: () => true,
      insert: () => { inserts++; },
      read: (co: string) => ({ co_art: co, art_des: 'TORNILLO HEX', tipo: 'C', co_lin: 'ACT', co_subl: 'EQT', uni_venta: 'UND', suni_venta: 'UND', tipo_imp: '1', co_cat: '01', co_color: '01', procedenci: '01', co_prov: 'GEN', tipo_cos: 'ULCO', dis_cen: '', co_us_in: 'DM' }),
    });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.ok).toBe(true);
    expect(r.alreadyRegistered).toBe(true);
    expect(r.coArt).toBe('ACTEQT0001');
    expect(inserts).toBe(0);
    expect(r.attempts[0].outcome).toBe('ALREADY_REGISTERED');
  });

  it('14K.5: existente ajeno avanza como colisión (sin reclamar)', async () => {
    const { engine } = fakeEngines({
      maxSeq: 0,
      exists: (co) => co === 'ACTEQT0001',
      rows: { ACTEQT0001: { co_art: 'ACTEQT0001', art_des: 'OTRO', co_lin: 'ACT' } },
    });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.ok).toBe(true);
    expect(r.coArt).toBe('ACTEQT0002');
    expect(r.alreadyRegistered).toBeFalsy();
  });

  it('14O: errorDetail nunca expone password (safeDetail)', async () => {
    const { engine } = fakeEngines({
      maxSeq: 0,
      exists: () => false,
      insert: () => { throw new Error('Login failed Server=SRV password=super-secreta-123'); },
    });
    const r = await engine.allocateAndInsert(INPUT);
    expect(r.ok).toBe(false);
    expect(r.errorDetail ?? '').not.toContain('super-secreta-123');
    expect(r.errorDetail ?? '').not.toContain('SRVBDPROFITBK');
  });

  it('18. la ruta de creación exige PROFIT.WRITE', () => {
    const perms: string[] = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, SolicitudesController.prototype.profitCreate) ?? [];
    expect(perms).toContain('PROFIT.WRITE');
  });
});

describe('14I adapter de escritura (fail-closed)', () => {
  const cfg = (vals: Record<string, string | undefined>) =>
    ({ get: (k: string) => vals[k] }) as any;

  it('flag OFF bloquea antes de cualquier SQL', async () => {
    const a = new ProfitWriteAdapterService(cfg({ PROFIT_WRITE_ENABLED: 'false' }));
    await expect(a.articleExists('X')).rejects.toThrow('PROFIT_WRITE_ENABLED=false');
  });

  it('sin credenciales SQL exige explícitas (sin trustedConnection muerto)', async () => {
    const a = new ProfitWriteAdapterService(
      cfg({
        PROFIT_WRITE_ENABLED: 'true',
        PROFIT_WRITE_SERVER: 'SRVBDPROFITBK',
        PROFIT_WRITE_DATABASE: 'AD_TRANS',
      }),
    );
    await expect(a.articleExists('X')).rejects.toThrow('explicit SQL credentials');
  });

  it('sin destino no hay escritura posible', () => {
    const a = new ProfitWriteAdapterService(cfg({ PROFIT_WRITE_ENABLED: 'true' }));
    expect(() => a.describeTarget()).toThrow('PROFIT_WRITE_SERVER/DATABASE missing');
  });
});

describe('usuario de integración Profit (fase actual)', () => {
  it('14. el adapter no expone update/delete (solo INSERT + lecturas)', () => {
    const proto: any = ProfitWriteAdapterService.prototype;
    for (const m of ['updateArticle', 'deleteArticle', 'update', 'delete', 'merge', 'upsert']) {
      expect(m in proto).toBe(false);
    }
    for (const m of ['insertArticle', 'articleExists', 'maxSequenceFor', 'readArticle', 'testConnection', 'describeTarget']) {
      expect(typeof proto[m]).toBe('function');
    }
  });
  it('1. configurado: plan incluye el código en el payload', async () => {
    const { engine } = fakeEngines({ maxSeq: 4, integrationUser: 'DM' });
    const r = await engine.plan(INPUT);
    expect(r.payload.co_us_in).toBe('DM');
    expect(r.candidate).toBe('ACTEQT0005');
  });

  it('2/3. ausente o inválido bloquea plan e INSERT sin tocar SQL', async () => {
    for (const bad of [null, '', 'TOOLONGCODE', 'A B', 'dm-1']) {
      const { engine, calls } = fakeEngines({ maxSeq: 0, integrationUser: bad as any });
      await expect(engine.plan(INPUT)).rejects.toThrow('Usuario de integración de Profit no configurado o inexistente.');
      await expect(engine.allocateAndInsert(INPUT)).rejects.toThrow('Usuario de integración de Profit no configurado o inexistente.');
      expect(calls.insert).toBe(0);
      expect(calls.maxSeq).toBe(0);
    }
  });

  it('4. el frontend no puede proporcionar co_us_in (DTO sin el campo)', () => {
    expect('co_us_in' in new ClassifyRequestDto()).toBe(false);
    expect('coUsIn' in new ClassifyRequestDto()).toBe(false);
  });

  it('6. INSERT usa exclusivamente el código configurado (input hostil ignorado)', async () => {
    let sent: any = null;
    const { engine } = fakeEngines({
      maxSeq: 0,
      exists: () => false,
      insert: (p: any) => { sent = p; },
      integrationUser: 'DM',
    });
    const r = await engine.allocateAndInsert({ ...INPUT, integrationUser: 'HACKER' } as any);
    expect(r.ok).toBe(true);
    expect(sent.co_us_in).toBe('DM');
  });

  it('7. VERIFY compara co_us_in (coincide y difiere)', async () => {
    const { engine } = fakeEngines({
      maxSeq: 0,
      exists: () => true,
      rows: {
        ACTEQT0001: { co_art: 'ACTEQT0001', art_des: 'TORNILLO HEX', tipo: 'C', co_lin: 'ACT', co_subl: 'EQT', uni_venta: 'UND', suni_venta: 'UND', tipo_imp: '1', co_cat: '01', co_color: '01', procedenci: '01', co_prov: 'GEN', tipo_cos: 'ULCO', dis_cen: '', co_us_in: 'DM' },
      },
      integrationUser: 'DM',
    });
    const ok = await engine.allocateAndInsert(INPUT);
    expect(ok.ok).toBe(true);
    expect(ok.alreadyRegistered).toBe(true);
    const { engine: e2 } = fakeEngines({
      maxSeq: 0,
      exists: (co) => co === 'ACTEQT0001',
      rows: {
        ACTEQT0001: { co_art: 'ACTEQT0001', art_des: 'TORNILLO HEX', tipo: 'C', co_lin: 'ACT', co_subl: 'EQT', uni_venta: 'UND', suni_venta: 'UND', tipo_imp: '1', co_cat: '01', co_color: '01', procedenci: '01', co_prov: 'GEN', tipo_cos: 'ULCO', dis_cen: '', co_us_in: 'OTRO' },
      },
      integrationUser: 'DM',
    });
    const bad = await e2.allocateAndInsert(INPUT);
    expect(bad.ok).toBe(true);
    expect(bad.coArt).toBe('ACTEQT0002');
  });
});
