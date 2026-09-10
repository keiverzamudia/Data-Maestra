import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../src/modulos/autenticacion/rbac.guard';
import { OrganizacionService } from '../src/modulos/organizacion/organizacion.service';
import { OrganizacionController } from '../src/modulos/organizacion/organizacion.controller';

process.env.JWT_SECRET = 'test-secret-12i';

interface Store {
  companies: Record<string, { id: string; name: string; code: string; active: boolean }>;
  departments: Record<string, { id: string; name: string; code: string; companyId: string; active: boolean }>;
  memberships: { id: string; userId: string; roleId: string; companyId: string; departmentId: string | null; active: boolean }[];
  roles: Record<string, { id: string; code: string; perms: string[] }>;
  overrides: { userId: string; effect: string; code: string }[];
  users: Record<string, { id: string; active: boolean }>;
  requests: number;
  audit: any[];
}

function seedStore(): Store {
  return {
    companies: {
      cA: { id: 'cA', name: 'Empresa A', code: 'EMP-A', active: true },
      cB: { id: 'cB', name: 'Empresa B', code: 'EMP-B', active: true },
      cC: { id: 'cC', name: 'Empresa C', code: 'EMP-C', active: true },
    },
    departments: {
      dA1: { id: 'dA1', name: 'Almacén', code: 'ALM', companyId: 'cA', active: true },
      dB1: { id: 'dB1', name: 'Almacén B', code: 'ALM', companyId: 'cB', active: true },
    },
    memberships: [
      { id: 'm1', userId: 'u1', roleId: 'rW', companyId: 'cA', departmentId: 'dA1', active: true },
      { id: 'm2', userId: 'u2', roleId: 'rW', companyId: 'cA', departmentId: null, active: true },
      { id: 'mA', userId: 'admin', roleId: 'rA', companyId: 'cB', departmentId: null, active: true },
    ],
    roles: {
      rW: { id: 'rW', code: 'WAREHOUSE', perms: ['WAREHOUSE.CLASSIFY'] },
      rA: { id: 'rA', code: 'MASTER_DATA_ADMIN', perms: ['ADMIN.MANAGE'] },
    },
    overrides: [],
    users: { u1: { id: 'u1', active: true }, u2: { id: 'u2', active: true }, admin: { id: 'admin', active: true } },
    requests: 5,
    audit: [],
  };
}

function mockPrisma(s: Store) {
  const roleOf = (roleId: string) => {
    const r = s.roles[roleId];
    return { code: r.code, rolePermissions: r.perms.map(code => ({ permission: { code } })) };
  };
  return {
    company: {
      findMany: vi.fn(async () => Object.values(s.companies).map(c => ({ ...c }))),
      findUnique: vi.fn(async ({ where }: any) => {
        const c = Object.values(s.companies).find(x => x.id === where.id || x.code === where.code);
        return c ? { ...c } : null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const c = { id: `c-${data.code}`, ...data };
        s.companies[c.id] = c;
        return c;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        Object.assign(s.companies[where.id], data);
        return { ...s.companies[where.id] };
      }),
      delete: vi.fn(async ({ where }: any) => { delete s.companies[where.id]; return {}; }),
    },
    department: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id) return s.departments[where.id] ? { ...s.departments[where.id] } : null;
        const k = Object.values(s.departments).find(d => d.companyId === where.companyId_code.companyId && d.code === where.companyId_code.code);
        return k ? { ...k } : null;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        let rows = Object.values(s.departments);
        if (where?.id?.in) rows = rows.filter(d => where.id.in.includes(d.id));
        return rows.map(d => ({ ...d }));
      }),
      groupBy: vi.fn(async () => {
        const m = new Map<string, number>();
        for (const d of Object.values(s.departments)) m.set(d.companyId, (m.get(d.companyId) ?? 0) + 1);
        return [...m.entries()].map(([companyId, n]) => ({ companyId, _count: { id: n } }));
      }),
      create: vi.fn(async ({ data }: any) => {
        const d = { id: `d-${data.code}`, ...data };
        s.departments[d.id] = d;
        return { ...d };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        Object.assign(s.departments[where.id], data);
        return { ...s.departments[where.id] };
      }),
      count: vi.fn(async ({ where }: any) => Object.values(s.departments).filter(d => d.companyId === where.companyId).length),
    },
    userRole: {
      findMany: vi.fn(async ({ where, include }: any) => {
        let rows = s.memberships.filter(m =>
          (where.companyId === undefined || (typeof where.companyId === 'string' ? m.companyId === where.companyId : true)) &&
          (where.companyId?.not === undefined || m.companyId !== where.companyId.not) &&
          (where.userId === undefined || m.userId === where.userId) &&
          (where.active === undefined || m.active === where.active),
        );
        if (include?.role) rows = rows.map(m => ({ ...m, role: roleOf(m.roleId) }));
        return rows;
      }),
      findFirst: vi.fn(async ({ where }: any) =>
        s.memberships.find(m =>
          m.userId === where.userId && m.roleId === where.roleId && m.companyId === where.companyId &&
          (m.departmentId ?? null) === (where.departmentId ?? null) && m.active === where.active,
        ) ?? null),
      update: vi.fn(async ({ where, data }: any) => {
        const m = s.memberships.find(x => x.id === where.id)!;
        Object.assign(m, data);
        return { ...m };
      }),
      count: vi.fn(async ({ where }: any) => s.memberships.filter(m => m.companyId === where.companyId).length),
    },
    user: {
      findUnique: vi.fn(async ({ where }: any) => (s.users[where.id] ? { ...s.users[where.id] } : null)),
    },
    userPermissionOverride: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async ({ where }: any) =>
        s.overrides.find(o => o.userId === where.userId && o.effect === where.effect) ?? null),
    },
    request: { count: vi.fn(async () => s.requests) },
    auditEvent: { count: vi.fn(async () => 0) },
    importRun: { count: vi.fn(async () => 0) },
    sourceItem: { count: vi.fn(async () => 0) },
    $transaction: vi.fn(async (fn: any) => fn({
      userRole: {
        findFirst: vi.fn(async ({ where }: any) =>
          s.memberships.find(m =>
            m.userId === where.userId && m.roleId === where.roleId && m.companyId === where.companyId &&
            (m.departmentId ?? null) === (where.departmentId ?? null) && m.active === where.active,
          ) ?? null),
        update: vi.fn(async ({ where, data }: any) => {
          const m = s.memberships.find(x => x.id === where.id)!;
          Object.assign(m, data);
          return { ...m };
        }),
      },
      company: {
        update: vi.fn(async ({ where, data }: any) => {
          Object.assign(s.companies[where.id], data);
          return { ...s.companies[where.id] };
        }),
      },
    })),
  } as any;
}

const auditoria = (s: Store) => ({ logEvent: vi.fn(async (e: any) => { s.audit.push(e); return {}; }) }) as any;
const svc = (s: Store) => new OrganizacionService(mockPrisma(s), auditoria(s));

describe('12I — empresas', () => {
  it('1. crear exige ADMIN.MANAGE', () => {
    const guard = new RbacGuard(new Reflector());
    const ctx: any = {
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', permissions: [] } }) }),
      getHandler: () => OrganizacionController.prototype['createCompany'],
      getClass: () => OrganizacionController,
    };
    expect(() => guard.canActivate(ctx)).toThrow(/ADMIN.MANAGE/);
  });

  it('2. crea empresa y audita COMPANY_CREATED', async () => {
    const s = seedStore();
    const c: any = await svc(s).createCompany({ name: 'Distribuidora Central', code: 'EMP-CEN' }, 'admin');
    expect(c.id).toBeTruthy();
    expect(s.audit.map(a => a.action)).toContain('COMPANY_CREATED');
  });

  it('3. código duplicado → 409', async () => {
    await expect(svc(seedStore()).createCompany({ name: 'Otra', code: 'EMP-A' }, 'admin')).rejects.toThrow(/código EMP-A/);
  });

  it('4. editar nombre conserva id y audita diff', async () => {
    const s = seedStore();
    const after: any = await svc(s).updateCompany('cA', { name: 'Distribuidora Central' }, 'admin');
    expect(after.id).toBe('cA');
    expect(after.name).toBe('Distribuidora Central');
    expect(s.companies.cA.code).toBe('EMP-A');
    const ev = s.audit.find(a => a.action === 'COMPANY_UPDATED');
    expect(JSON.parse(ev.beforeData).name).toBe('Empresa A');
    expect(JSON.parse(ev.afterData).name).toBe('Distribuidora Central');
  });

  it('5. desactivar registra COMPANY_DEACTIVATED', async () => {
    const s = seedStore();
    await svc(s).updateCompany('cA', { active: false }, 'admin');
    expect(s.companies.cA.active).toBe(false);
    expect(s.audit.map(a => a.action)).toContain('COMPANY_DEACTIVATED');
  });

  it('6. eliminar con referencias → 409 sin borrar', async () => {
    const s = seedStore();
    await expect(svc(s).deleteCompany('cA', 'admin')).rejects.toThrow(/referencias históricas/);
    expect(s.companies.cA).toBeTruthy();
  });

  it('7. lista incluye conteos de usuarios y departamentos', async () => {
    const rows: any[] = await svc(seedStore()).findCompanies();
    const a = rows.find(r => r.id === 'cA');
    expect(a.userCount).toBe(2);
    expect(a.departmentCount).toBe(1);
  });
});

describe('12I — migración', () => {
  it('8. preview sin cambios: usuarios, deptos, histórico', async () => {
    const res: any = await svc(seedStore()).previewMigration('cA', 'cB');
    expect(res.users).toBe(2);
    expect(res.departments).toHaveLength(1);
    expect(res.departments[0]).toMatchObject({ id: 'dA1', memberships: 1 });
    expect(res.historicalRequests).toBe(5);
  });

  it('9. misma empresa → 400; destino inactivo → 400', async () => {
    const s = seedStore();
    await expect(svc(s).migrateCompany({ fromCompanyId: 'cA', toCompanyId: 'cA' }, 'admin')).rejects.toThrow(/diferente/);
    s.companies.cB.active = false;
    await expect(svc(s).migrateCompany({ fromCompanyId: 'cA', toCompanyId: 'cB' }, 'admin')).rejects.toThrow(/inactiva/);
  });

  it('10. depto sin equivalencia → 400 explícito', async () => {
    await expect(
      svc(seedStore()).migrateCompany({ fromCompanyId: 'cA', toCompanyId: 'cB', departmentMap: {} }, 'admin'),
    ).rejects.toThrow(/sin equivalencia/);
  });

  it('11. migra transaccional, conserva identidad y retira origen', async () => {
    const s = seedStore();
    const res: any = await svc(s).migrateCompany(
      { fromCompanyId: 'cA', toCompanyId: 'cB', departmentMap: { dA1: 'dB1' } },
      'admin',
    );
    expect(res).toMatchObject({ ok: true, users: 2, departmentsAffected: 1, historicalRequests: 5 });
    const m1 = s.memberships.find(m => m.id === 'm1')!;
    expect(m1.companyId).toBe('cB');
    expect(m1.departmentId).toBe('dB1');
    const m2 = s.memberships.find(m => m.id === 'm2')!;
    expect(m2.companyId).toBe('cB');
    expect(m2.departmentId).toBeNull();
    expect(s.companies.cA.active).toBe(false);
    expect(s.requests).toBe(5);
    const actions = s.audit.map(a => a.action);
    expect(actions).toContain('COMPANY_MIGRATION_STARTED');
    expect(actions).toContain('COMPANY_MIGRATION_COMPLETED');
    const done = s.audit.find(a => a.action === 'COMPANY_MIGRATION_COMPLETED');
    expect(JSON.parse(done.afterData)).toMatchObject({ fromCompanyId: 'cA', toCompanyId: 'cB', users: 2 });
  });

  it('12. el actor migrado conserva su acceso administrativo', async () => {
    const s = seedStore();
    // admin solo administra desde cA: tras migrar debe seguir con ADMIN.MANAGE en destino.
    s.memberships = s.memberships.filter(m => m.id !== 'mA');
    s.memberships.push({ id: 'mA2', userId: 'admin', roleId: 'rA', companyId: 'cA', departmentId: null, active: true });
    const res: any = await svc(s).migrateCompany(
      { fromCompanyId: 'cA', toCompanyId: 'cB', departmentMap: { dA1: 'dB1' } },
      'admin',
    );
    expect(res.ok).toBe(true);
    const mine = s.memberships.find(m => m.id === 'mA2')!;
    expect(mine.companyId).toBe('cB');
    expect(mine.active).toBe(true);
  });
});

describe('12I — departamentos crear/estado', () => {
  it('13. crear exige ADMIN.MANAGE y audita', async () => {
    const guard = new RbacGuard(new Reflector());
    const ctx: any = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
      getHandler: () => OrganizacionController.prototype['createDepartment'],
      getClass: () => OrganizacionController,
    };
    expect(() => guard.canActivate(ctx)).toThrow(/Sesión requerida/);
    const s = seedStore();
    const d: any = await svc(s).createDepartment({ name: 'Logística', code: 'LOG', companyId: 'cA' }, 'admin');
    expect(d.companyId).toBe('cA');
    expect(s.audit.map(a => a.action)).toContain('DEPARTMENT_CREATED');
  });

  it('14. código duplicado en empresa → 409; misma sigla en otra empresa OK', async () => {
    const s = seedStore();
    await expect(svc(s).createDepartment({ name: 'Otro', code: 'ALM', companyId: 'cA' }, 'admin')).rejects.toThrow(/ya existe/i);
    const d: any = await svc(s).createDepartment({ name: 'Almacén C', code: 'ALM', companyId: 'cC' }, 'admin');
    expect(d.companyId).toBe('cC');
  });

  it('15. activar/desactivar vía PATCH audita diff', async () => {
    const s = seedStore();
    await svc(s).updateDepartment('dA1', { active: false }, 'admin');
    expect(s.departments.dA1.active).toBe(false);
    const ev = s.audit.find(a => a.action === 'DEPARTMENT_UPDATED');
    expect(JSON.parse(ev.afterData).active).toBe(false);
  });
});
