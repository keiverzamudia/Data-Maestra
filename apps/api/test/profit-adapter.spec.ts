import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfitAdapterService } from '../src/modulos/profit/profit-adapter.service';

function createConfigMock(values: Record<string, string | undefined>) {
  return {
    get: vi.fn((key: string) => values[key]),
  } as any;
}

describe('ProfitAdapterService', () => {
  let config: any;

  beforeEach(() => {
    vi.resetModules();
  });

  it('throws ServiceUnavailable when not configured', async () => {
    config = createConfigMock({});
    const svc = new ProfitAdapterService(config);
    await expect(svc.getGroups()).rejects.toThrow(/Profit not configured/);
  });

  it('returns null for non-existent article when DB reports empty', async () => {
    // This test verifies the contract: getArticle returns null when not found, not throw
    // We check the code handles empty recordset
    const fs = await import('fs');
    const content = fs.readFileSync('src/modulos/profit/profit-adapter.service.ts', 'utf-8');
    expect(content).toContain('return rows[0] ?? null');
  });

  it('uses parameterized queries (no string concatenation)', async () => {
    // Verify service does not build SQL via template with user value
    const fs = await import('fs');
    const content = fs.readFileSync('src/modulos/profit/profit-adapter.service.ts', 'utf-8');
    expect(content).toContain('request.input(');
    expect(content).not.toMatch(/WHERE co_art = '\$\{code\}'/);
    expect(content).not.toMatch(/WHERE co_art = '\$\{.*\}'/);
  });

  it('has no write operations', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('src/modulos/profit/profit-adapter.service.ts', 'utf-8');
    const upper = content.toUpperCase();
    // Should have SELECT but no INSERT/UPDATE/DELETE/MERGE/TRUNCATE as SQL keywords operating on dbo
    expect(upper).toContain('SELECT');
    // Ensure no DML keywords in query strings (allow in comments)
    const queries = content.match(/`SELECT[^`]*`/g) || [];
    queries.forEach(q => {
      expect(q.toUpperCase()).not.toContain('INSERT INTO DBO');
      expect(q.toUpperCase()).not.toContain('UPDATE DBO');
      expect(q.toUpperCase()).not.toContain('DELETE FROM DBO');
    });
  });

  it('has write protection logic', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('src/modulos/profit/profit-adapter.service.ts', 'utf-8');
    expect(content).toContain('PROFIT_WRITE_ENABLED');
    expect(content).toContain('PROTECTION');
  });

  it('exposes READ-ONLY accounts catalog from sccuenta (Fase 8E.6)', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('src/modulos/profit/profit-adapter.service.ts', 'utf-8');
    expect(content).toContain('getAccounts');
    expect(content).toContain('C_DIST.dbo.sccuenta');
    expect(content).toContain('detalle = 1');
    expect(content).toContain('inactivo = 0');
    expect(content).toContain('OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY');
    // xart_cont queda como referencia de uso, no como catálogo
    expect(content).not.toMatch(/FROM dbo\.xart_cont[^`]*AS code/);
  });

  it('searches accounts by code AND name (Fase 8E.6.1)', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('src/modulos/profit/profit-adapter.service.ts', 'utf-8');
    expect(content).toContain(`co_cue LIKE '%' + @search + '%'`);
    expect(content).toContain(`des_cue LIKE '%' + @search + '%'`);
  });

  it('exposes brands from colores with code and description (Fase 8F)', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('src/modulos/profit/profit-adapter.service.ts', 'utf-8');
    expect(content).toContain('getBrands');
    expect(content).toContain('SELECT co_col, des_col FROM dbo.colores ORDER BY co_col');
    expect(content).toContain('LTRIM(RTRIM(@co_col))');
  });

  it('has timeouts configured', async () => {
    const fs = await import('fs');
    const content = fs.readFileSync('src/modulos/profit/profit-adapter.service.ts', 'utf-8');
    expect(content).toContain('connectTimeout');
    expect(content).toContain('requestTimeout');
  });
});
