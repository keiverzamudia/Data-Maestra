import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProfitWriteAdapterService } from '../src/modulos/profit/profit-write.adapter';
import { ProfitArticleCreationService } from '../src/modulos/profit/profit-article-creation.service';
import { profitDriver } from '../src/modulos/profit/profit-driver';

/** 14J §28 — selección de modo de autenticación y seguridad (sin red). */
describe('profit write auth modes (14J)', () => {
  const cfg = (vals: Record<string, string | undefined>) =>
    ({ get: (k: string) => vals[k] }) as any;

  it('1-2. windows/sql seleccionan su implementación', () => {
    expect(new ProfitWriteAdapterService(cfg({ PROFIT_WRITE_AUTH: 'windows' })).authMode()).toBe('windows');
    expect(new ProfitWriteAdapterService(cfg({ PROFIT_WRITE_AUTH: 'sql' })).authMode()).toBe('sql');
    expect(new ProfitWriteAdapterService(cfg({})).authMode()).toBe('sql');
  });

  it('3. windows no exige USER/PASSWORD para describir destino', () => {
    const a = new ProfitWriteAdapterService(cfg({
      PROFIT_WRITE_AUTH: 'windows',
      PROFIT_WRITE_SERVER: 'SRVBDPROFITBK',
      PROFIT_WRITE_DATABASE: 'AD_TRANS',
    }));
    expect(a.describeTarget()).toEqual({ server: 'SRVBDPROFITBK', database: 'AD_TRANS' });
  });

  it('4. sql exige USER/PASSWORD explícitos con mensaje claro', async () => {
    const a = new ProfitWriteAdapterService(cfg({
      PROFIT_WRITE_AUTH: 'sql',
      PROFIT_WRITE_ENABLED: 'true',
      PROFIT_WRITE_SERVER: 'S',
      PROFIT_WRITE_DATABASE: 'D',
    }));
    await expect(a.articleExists('X')).rejects.toThrow('explicit SQL credentials');
  });

  it('5. ningún error expone secretos', () => {
    const a = new ProfitWriteAdapterService(cfg({
      PROFIT_WRITE_ENABLED: 'true',
      PROFIT_WRITE_USER: 'u',
      PROFIT_WRITE_PASSWORD: 'super-secreta-123',
    }));
    try {
      a.describeTarget();
      expect.unreachable();
    } catch (e: any) {
      expect(String(e.message)).not.toContain('super-secreta-123');
    }
  });

  it('6. flag OFF bloquea antes de cualquier SQL', async () => {
    const a = new ProfitWriteAdapterService(cfg({ PROFIT_WRITE_ENABLED: 'false' }));
    await expect(a.articleExists('X')).rejects.toThrow('PROFIT_WRITE_ENABLED=false');
  });

  it('writeStatus NOT_CONFIGURED sin red cuando falta destino', async () => {
    const write: any = {
      isWriteEnabled: () => false,
      authMode: () => 'windows',
      describeTarget: () => { throw new Error('missing'); },
    };
    const engine = new ProfitArticleCreationService(write, {} as any);
    const s = await engine.writeStatus();
    expect(s).toMatchObject({ enabled: false, configured: false, connected: false, code: 'NOT_CONFIGURED' });
  });

  it('writeStatus refleja conexión probada (mock)', async () => {
    const write: any = {
      isWriteEnabled: () => false,
      authMode: () => 'windows',
      describeTarget: () => ({ server: 'SRVBDPROFITBK', database: 'AD_TRANS' }),
      testConnection: async () => ({ connected: true, identity: 'CORPOAGROCA\\x', database: 'AD_TRANS', server: 'SRVBDPROFITBK' }),
    };
    const engine = new ProfitArticleCreationService(write, {} as any);
    const s = await engine.writeStatus();
    expect(s).toMatchObject({ configured: true, connected: true, auth: 'windows', server: 'SRVBDPROFITBK' });
  });
});

/** 14K.2 — invariante de driver único: ningún archivo del módulo Profit
 *  puede importar tedious pelado (`mssql`), porque flips el global
 *  shared.driver y corrompe los pools del otro driver (queryRaw). */
describe('profit driver único (14K.2)', () => {
  it('profitDriver expone ConnectionPool/Request/tipos del wrapper', async () => {
    const d1: any = await profitDriver();
    const d2: any = await profitDriver();
    expect(d1).toBe(d2);
    expect(typeof d1.ConnectionPool).toBe('function');
    expect(typeof d1.Request).toBe('function');
    for (const t of ['Char', 'VarChar', 'Text', 'Int']) {
      expect(d1[t]).toBeDefined();
    }
  });

  it('ningún fuente del módulo importa tedious pelado', () => {
    const dir = path.join(__dirname, '..', 'src', 'modulos', 'profit');
    const bad: string[] = [];
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue;
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      const lines = src.split('\n');
      lines.forEach((ln, i) => {
        const t = ln.trim();
        if (t.includes("import('mssql')") || t.match(/^import .* from 'mssql'$/)) {
          bad.push(`${f}:${i + 1}`);
        }
      });
    }
    expect(bad).toEqual([]);
  });
});
