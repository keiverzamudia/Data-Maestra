import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../src/modulos/autenticacion/rbac.guard';
import { UsuariosService } from '../src/modulos/usuarios/usuarios.service';
import { UsuariosController } from '../src/modulos/usuarios/usuarios.controller';

process.env.JWT_SECRET = 'test-secret-10j';

interface Store {
  users: Record<string, { id: string }>;
  links: Set<string>; // "userId:roleId:companyId:deptId|null"
  audit: any[];
  txUsed: number;
  ops: string[];
}

function seedStore(): Store {
  return {
    users: { u1: { id: 'u1' }, u2: { id: 'u2' }, u3: { id: 'u3' } },
    links: new Set(['u2:rW:c1:null']),
    audit: [],
    txUsed: 0,
    ops: [],
  };
}

function mockPrisma(s: Store) {
  return {
    user: {
      findUnique: vi.fn(async ({ where }: any) => (s.users[where.id] ? { ...s.users[where.id] } : null)),
      update: vi.fn(async () => { s.ops.push('user.update'); return {}; }),
    },
    userRole: {
      findFirst: vi.fn(async ({ where }: any) => {
        const dept = where.departmentId ?? null;
        const key = `${where.userId}:${where.roleId}:${where.companyId}:${dept}`;
        return s.links.has(key) ? { id: `ur-${key}` } : null;
      }),
      create: vi.fn(async ({ data }: any) => {
        s.ops.push('userRole.create');
        s.links.add(`${data.userId}:${data.roleId}:${data.companyId}:${data.departmentId ?? null}`);
        return { id: 'ur-new', ...data };
      }),
    },
    role: { findUnique: vi.fn(async ({ where }: any) => (where.code === 'WAREHOUSE' ? { id: 'rW', code: 'WAREHOUSE' } : null)) },
    company: { findUnique: vi.fn(async ({ where }: any) => (where.id === 'c1' ? { id: 'c1', code: 'EMP-A' } : null)) },
    department: { findUnique: vi.fn(async ({ where }: any) => (where.id === 'd1' ? { id: 'd1', companyId: 'c1' } : null)) },
    session: { updateMany: vi.fn(async () => { s.ops.push('session.updateMany'); return { count: 0 }; }) },
    userPermissionOverride: {
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async () => { s.ops.push('override.upsert'); return {}; }),
      delete: vi.fn(async () => { s.ops.push('override.delete'); return {}; }),
    },
    $transaction: vi.fn(async (ops: any[]) => { s.txUsed += 1; return Promise.all(ops); }),
  } as any;
}

const auditoria = (s: Store) => ({ logEvent: vi.fn(async (e: any) => { s.audit.push(e); return {}; }) }) as any;
const svc = (s: Store) => new UsuariosService(mockPrisma(s), {} as any, auditoria(s));
const DTO = (over: any = {}) => ({ userIds: ['u1', 'u2', 'u3'], roleCode: 'WAREHOUSE', companyId: 'c1', departmentId: null, ...over });

describe('10J — asignación masiva de rol', () => {
  it('1. sin sesión → 401', () => {
    const guard = new RbacGuard(new Reflector());
    const ctx: any = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
      getHandler: () => UsuariosController.prototype['asignarRolMasivo'],
      getClass: () => UsuariosController,
    };
    expect(() => guard.canActivate(ctx)).toThrow(/Sesión requerida/);
  });

  it('2. sin ADMIN.MANAGE → 403', () => {
    const guard = new RbacGuard(new Reflector());
    const ctx: any = {
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', permissions: ['REQUEST.VIEW'] } }) }),
      getHandler: () => UsuariosController.prototype['asignarRolMasivo'],
      getClass: () => UsuariosController,
    };
    expect(() => guard.canActivate(ctx)).toThrow(/ADMIN.MANAGE/);
  });

  it('3. rol inexistente → 404', async () => {
    await expect(svc(seedStore()).assignRoleBulk(DTO({ roleCode: 'NOPE' }), 'u-admin')).rejects.toThrow(/Rol no encontrado/);
  });

  it('4. userIds vacío → 400', async () => {
    await expect(svc(seedStore()).assignRoleBulk(DTO({ userIds: [] }), 'u-admin')).rejects.toThrow(/vacío/);
  });

  it('5. usuario inexistente → FAILED sin lanzar', async () => {
    const res: any = await svc(seedStore()).assignRoleBulk(DTO({ userIds: ['u1', 'u-ghost'] }), 'u-admin');
    expect(res.failed).toBe(1);
    expect(res.results.find((r: any) => r.userId === 'u-ghost')).toMatchObject({ status: 'FAILED' });
    expect(res.results.find((r: any) => r.userId === 'u1').status).toBe('ASSIGNED');
  });

  it('6. asigna el rol a varios usuarios con resumen estructurado', async () => {
    const s = seedStore();
    const res: any = await svc(s).assignRoleBulk(DTO({ userIds: ['u1', 'u3'] }), 'u-admin');
    expect(res).toMatchObject({ total: 2, assigned: 2, alreadyAssigned: 0, failed: 0 });
    expect(res.correlationId).toBeTruthy();
    expect(res.results.every((r: any) => r.status === 'ASSIGNED')).toBe(true);
  });

  it('7/8. ya asignado no duplica ni modifica', async () => {
    const s = seedStore();
    const service = svc(s);
    const before = s.links.size;
    const res: any = await service.assignRoleBulk(DTO({ userIds: ['u2'] }), 'u-admin');
    expect(res).toMatchObject({ total: 1, assigned: 0, alreadyAssigned: 1, failed: 0 });
    expect(s.links.size).toBe(before);
  });

  it('9. operación transaccional ($transaction única)', async () => {
    const s = seedStore();
    const prisma: any = mockPrisma(s);
    const service = new UsuariosService(prisma, {} as any, auditoria(s));
    await service.assignRoleBulk(DTO({ userIds: ['u1', 'u3'] }), 'u-admin');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(s.txUsed).toBe(1);
  });

  it('10. auditoría solo para cambios reales', async () => {
    const s = seedStore();
    await svc(s).assignRoleBulk(DTO({ userIds: ['u1', 'u2', 'u-ghost'] }), 'u-admin');
    const bulk = s.audit.filter(a => a.action === 'ROLE_ASSIGNED_BULK');
    expect(bulk).toHaveLength(1);
    expect(bulk[0].entityId).toBe('u1');
  });

  it('11. correlationId común para la operación', async () => {
    const s = seedStore();
    const res: any = await svc(s).assignRoleBulk(DTO({ userIds: ['u1', 'u3'] }), 'u-admin');
    const ids = new Set(s.audit.map(a => a.correlationId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBe(res.correlationId);
    expect(s.audit[0].actorId).toBe('u-admin');
  });

  it('12. overrides permanecen intactos', async () => {
    const s = seedStore();
    await svc(s).assignRoleBulk(DTO({ userIds: ['u1'] }), 'u-admin');
    expect(s.ops).not.toContain('override.upsert');
    expect(s.ops).not.toContain('override.delete');
  });

  it('13. no modificar otros datos del usuario', async () => {
    const s = seedStore();
    await svc(s).assignRoleBulk(DTO({ userIds: ['u1', 'u2'] }), 'u-admin');
    expect(s.ops).not.toContain('user.update');
    expect(s.ops).not.toContain('session.updateMany');
    expect(s.ops.filter(o => o === 'userRole.create')).toHaveLength(1);
  });
});
