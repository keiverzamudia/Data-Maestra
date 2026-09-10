import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../src/modulos/autenticacion/rbac.guard';
import { ProfitAdapterService } from '../src/modulos/profit/profit-adapter.service';
import { ProfitController } from '../src/modulos/profit/profit.controller';

process.env.JWT_SECRET = 'test-secret-12c';

function adapterWith(queryImpl: (sql: string) => Promise<any[]>) {
  const adapter = new ProfitAdapterService({ get: () => undefined } as any);
  (adapter as any).query = vi.fn(async (sql: string) => queryImpl(sql));
  return adapter;
}

describe('12C — estándar contable de grupo (lin_art.dis_cen)', () => {
  it('1. endpoint exige ACCOUNTING.VIEW', () => {
    const guard = new RbacGuard(new Reflector());
    const ctx: any = {
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', permissions: ['REQUEST.VIEW'] } }) }),
      getHandler: () => ProfitController.prototype['getGroupStandard'],
      getClass: () => ProfitController,
    };
    expect(() => guard.canActivate(ctx)).toThrow(/ACCOUNTING.VIEW/);
  });

  it('2. parsea formato de grupo con espacios y ordena posiciones', async () => {
    const adapter = adapterWith(async (sql) =>
      sql.includes('lin_art')
        ? [{ dis: '<DIS> {c1:1.1.04.03.01.006}{c7:1.1.04.01.01.001}{c8:7.1.10.01.01.003} </DIS> ' }]
        : [{ code: 'x', description: 'Desc' }],
    );
    const res = await adapter.getGroupAccountingStandard('FER');
    expect(res).toMatchObject({ groupCode: 'FER', configured: true });
    expect(res.positions.map(p => p.position)).toEqual(['c1', 'c7', 'c8']);
    expect(res.positions[0]).toMatchObject({ code: '1.1.04.03.01.006', description: 'Desc', inCatalog: true });
  }, 30000);

  it('3. omite posiciones vacías ({c8:}) y marca fuera de catálogo', async () => {
    const adapter = adapterWith(async (sql) =>
      sql.includes('lin_art')
        ? [{ dis: '<DIS> {c1:7.1.19.01.01.002}{c7:1.1.04.01.01.001}{c8:} </DIS>' }]
        : [],
    );
    const res = await adapter.getGroupAccountingStandard('GEN');
    expect(res.positions.map(p => p.position)).toEqual(['c1', 'c7']);
    expect(res.positions[0].inCatalog).toBe(false);
    expect(res.positions[0].description).toBe('');
  });

  it('4. grupo sin dis_cen → configured:false', async () => {
    const adapter = adapterWith(async (sql) =>
      sql.includes('lin_art') ? [{ dis: '' }] : [],
    );
    const res = await adapter.getGroupAccountingStandard('UNV');
    expect(res).toMatchObject({ groupCode: 'UNV', configured: false, positions: [] });
  });

  it('5. grupo inexistente → configured:false', async () => {
    const adapter = adapterWith(async () => []);
    const res = await adapter.getGroupAccountingStandard('ZZZ');
    expect(res.configured).toBe(false);
  });
});
