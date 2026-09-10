import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../src/modulos/autenticacion/rbac.guard';
import { UsuariosService } from '../src/modulos/usuarios/usuarios.service';
import { UsuariosController } from '../src/modulos/usuarios/usuarios.controller';

process.env.JWT_SECRET = 'test-secret-11g-users';

interface Store {
  users: { id: string; displayName: string; active: boolean }[];
  lastFindManyArgs: any;
}

function seedStore(): Store {
  return {
    users: [
      { id: 'u1', displayName: 'KEIBER ZAMUDIA', active: true },
      { id: 'u2', displayName: 'Ana López', active: true },
      { id: 'u3', displayName: 'Luis Pérez', active: false },
    ],
    lastFindManyArgs: null,
  };
}

function matchWhere(u: { displayName: string; active: boolean }, where: any): boolean {
  if (!where || Object.keys(where).length === 0) return true;
  if (typeof where.active === 'boolean' && u.active !== where.active) return false;
  if (where.OR) {
    const q = where.OR[0]?.displayName?.contains ?? '';
    if (q && !u.displayName.includes(q)) return false;
  }
  return true;
}

function mockPrisma(s: Store) {
  return {
    user: {
      findMany: vi.fn(async (args: any) => {
        s.lastFindManyArgs = args;
        const rows = s.users.filter(u => matchWhere(u, args.where));
        return rows.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? 25));
      }),
      count: vi.fn(async (args: any = {}) => s.users.filter(u => matchWhere(u, args.where)).length),
    },
  } as any;
}

const svc = (s: Store) => new UsuariosService(mockPrisma(s), {} as any, { logEvent: vi.fn() } as any);

describe('11G-A — búsqueda admin con totales globales', () => {
  it('1. sin sesión → 401', () => {
    const guard = new RbacGuard(new Reflector());
    const ctx: any = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
      getHandler: () => UsuariosController.prototype['buscar'],
      getClass: () => UsuariosController,
    };
    expect(() => guard.canActivate(ctx)).toThrow(/Sesión requerida/);
  });

  it('2. sin ADMIN.MANAGE → 403', () => {
    const guard = new RbacGuard(new Reflector());
    const ctx: any = {
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', permissions: ['REQUEST.VIEW'] } }) }),
      getHandler: () => UsuariosController.prototype['buscar'],
      getClass: () => UsuariosController,
    };
    expect(() => guard.canActivate(ctx)).toThrow(/ADMIN.MANAGE/);
  });

  it('3. sin búsqueda: total == filteredTotal y activos/inactivos globales', async () => {
    const res: any = await svc(seedStore()).searchAdmin({});
    expect(res).toMatchObject({ total: 3, filteredTotal: 3, activeTotal: 2, inactiveTotal: 1, page: 1, limit: 25 });
    expect(res.items).toHaveLength(3);
  });

  it('4. búsqueda no altera el total global', async () => {
    const res: any = await svc(seedStore()).searchAdmin({ search: 'KEI' });
    expect(res.total).toBe(3);
    expect(res.activeTotal).toBe(2);
    expect(res.filteredTotal).toBe(1);
    expect(res.items.map((u: any) => u.displayName)).toEqual(['KEIBER ZAMUDIA']);
  });

  it('5. paginación server-side con skip/take', async () => {
    const s = seedStore();
    const service = svc(s);
    const p1: any = await service.searchAdmin({ page: 1, limit: 25 });
    expect(p1.items).toHaveLength(3);
    const prisma: any = (service as any).prisma;
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 25 }));
    await service.searchAdmin({ page: 2, limit: 25 });
    expect(s.lastFindManyArgs.skip).toBe(25);
  });

  it('6. limit fuera de lista → 25; page inválida → 1', async () => {
    const s = seedStore();
    const res: any = await svc(s).searchAdmin({ page: NaN, limit: 20 });
    expect(res.page).toBe(1);
    expect(res.limit).toBe(25);
    const res2: any = await svc(s).searchAdmin({ limit: 50 });
    expect(res2.limit).toBe(50);
  });
});
