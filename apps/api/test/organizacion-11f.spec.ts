import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../src/modulos/autenticacion/rbac.guard';
import { OrganizacionService } from '../src/modulos/organizacion/organizacion.service';
import { OrganizacionController } from '../src/modulos/organizacion/organizacion.controller';

process.env.JWT_SECRET = 'test-secret-11f';

interface Store {
  departments: Record<string, { id: string; name: string; managerId: string | null; companyId: string }>;
  users: Record<string, { id: string; active: boolean }>;
  audit: any[];
}

function seedStore(): Store {
  return {
    departments: { d1: { id: 'd1', name: 'Almacén', managerId: null, companyId: 'c1' } },
    users: { u1: { id: 'u1', active: true }, uOff: { id: 'uOff', active: false } },
    audit: [],
  };
}

function mockPrisma(s: Store) {
  return {
    department: {
      findUnique: vi.fn(async ({ where }: any) => (s.departments[where.id] ? { ...s.departments[where.id] } : null)),
      update: vi.fn(async ({ where, data }: any) => {
        s.departments[where.id] = { ...s.departments[where.id], ...data };
        return { ...s.departments[where.id] };
      }),
    },
    user: {
      findUnique: vi.fn(async ({ where }: any) => (s.users[where.id] ? { ...s.users[where.id] } : null)),
    },
  } as any;
}

const auditoria = (s: Store) => ({ logEvent: vi.fn(async (e: any) => { s.audit.push(e); return {}; }) }) as any;
const svc = (s: Store) => new OrganizacionService(mockPrisma(s), auditoria(s));

describe('11F — edición de departamentos', () => {
  it('1. sin sesión → 401', () => {
    const guard = new RbacGuard(new Reflector());
    const ctx: any = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
      getHandler: () => OrganizacionController.prototype['updateDepartment'],
      getClass: () => OrganizacionController,
    };
    expect(() => guard.canActivate(ctx)).toThrow(/Sesión requerida/);
  });

  it('2. sin ADMIN.MANAGE → 403', () => {
    const guard = new RbacGuard(new Reflector());
    const ctx: any = {
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', permissions: ['REQUEST.VIEW'] } }) }),
      getHandler: () => OrganizacionController.prototype['updateDepartment'],
      getClass: () => OrganizacionController,
    };
    expect(() => guard.canActivate(ctx)).toThrow(/ADMIN.MANAGE/);
  });

  it('3. departamento inexistente → 404', async () => {
    await expect(svc(seedStore()).updateDepartment('ghost', { name: 'Xyz' }, 'u-admin')).rejects.toThrow(/no encontrado/i);
  });

  it('4. nombre demasiado corto → 400', async () => {
    await expect(svc(seedStore()).updateDepartment('d1', { name: 'X' }, 'u-admin')).rejects.toThrow(/2 y 120/);
  });

  it('5. sin cambios → 400', async () => {
    await expect(svc(seedStore()).updateDepartment('d1', {}, 'u-admin')).rejects.toThrow(/Sin cambios/);
  });

  it('6. gerente inexistente → 400', async () => {
    await expect(svc(seedStore()).updateDepartment('d1', { managerId: 'ghost' }, 'u-admin')).rejects.toThrow(/gerente/i);
  });

  it('7. gerente inactivo → 400', async () => {
    await expect(svc(seedStore()).updateDepartment('d1', { managerId: 'uOff' }, 'u-admin')).rejects.toThrow(/gerente/i);
  });

  it('8. actualiza nombre y persiste', async () => {
    const s = seedStore();
    const after: any = await svc(s).updateDepartment('d1', { name: 'Almacén Central' }, 'u-admin');
    expect(after.name).toBe('Almacén Central');
    expect(s.departments.d1.name).toBe('Almacén Central');
  });

  it('9. asigna gerente y permite quitarlo con null', async () => {
    const s = seedStore();
    const service = svc(s);
    await service.updateDepartment('d1', { managerId: 'u1' }, 'u-admin');
    expect(s.departments.d1.managerId).toBe('u1');
    await service.updateDepartment('d1', { managerId: null }, 'u-admin');
    expect(s.departments.d1.managerId).toBeNull();
  });

  it('10. audita con diff before/after', async () => {
    const s = seedStore();
    await svc(s).updateDepartment('d1', { name: 'Almacén Norte' }, 'u-admin');
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]).toMatchObject({ entityType: 'Department', entityId: 'd1', action: 'DEPARTMENT_UPDATED', actorId: 'u-admin' });
    expect(JSON.parse(s.audit[0].beforeData)).toMatchObject({ name: 'Almacén' });
    expect(JSON.parse(s.audit[0].afterData)).toMatchObject({ name: 'Almacén Norte' });
  });
});
