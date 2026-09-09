import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { RbacGuard } from '../src/modulos/autenticacion/rbac.guard';
import { AuditoriaService } from '../src/modulos/auditoria/auditoria.service';
import { AuditoriaController } from '../src/modulos/auditoria/auditoria.controller';

process.env.JWT_SECRET = 'test-secret-10k';

function rows() {
  return [
    { id: 'e1', correlationId: 'ABC123', actorId: 'u5', entityType: 'User', entityId: 'u1', action: 'ROLE_ASSIGNED_BULK', createdAt: new Date('2026-09-01T10:00:00Z'), actor: { id: 'u5', displayName: 'Luis', username: 'l.m' } },
    { id: 'e2', correlationId: 'XYZ', actorId: 'u5', entityType: 'User', entityId: 'u1', action: 'USER_PASSWORD_RESET', afterData: JSON.stringify({ mustChangePassword: true }), createdAt: new Date('2026-09-02T10:00:00Z'), actor: { id: 'u5', displayName: 'Luis', username: 'l.m' } },
  ];
}

function mockPrisma() {
  const calls: any = { findMany: [], count: 0, create: 0 };
  return {
    calls,
    auditEvent: {
      findMany: vi.fn(async (args: any) => { calls.findMany.push(args); return rows(); }),
      findUnique: vi.fn(async ({ where }: any) => rows().find(r => r.id === where.id) ?? null),
      count: vi.fn(async () => { calls.count += 1; return 2; }),
      create: vi.fn(async () => { calls.create += 1; return { id: 'n' }; }),
    },
    user: {
      findMany: vi.fn(async () => [{ id: 'u1', displayName: 'Juan Pérez', username: 'j.perez' }]),
      findUnique: vi.fn(async () => ({ id: 'u1', displayName: 'Juan Pérez', username: 'j.perez' })),
    },
  } as any;
}

const svc = (p: any) => new AuditoriaService(p);

function guardCtx(user: any, method: string): any {
  return {
    switchToHttp: () => ({ getRequest: () => (user ? { user } : {}) }),
    getHandler: () => (AuditoriaController.prototype as any)[method],
    getClass: () => AuditoriaController,
  };
}

describe('10K — auditoría consultable', () => {
  it('1. sin sesión → 401', () => {
    const guard = new RbacGuard(new Reflector());
    expect(() => guard.canActivate(guardCtx(null, 'findEvents'))).toThrow(/Sesión requerida/);
  });

  it('2. sin AUDIT.VIEW → 403', () => {
    const guard = new RbacGuard(new Reflector());
    expect(() => guard.canActivate(guardCtx({ id: 'u1', permissions: ['REQUEST.VIEW'] }, 'findEvents'))).toThrow(/AUDIT.VIEW/);
  });

  it('3. con AUDIT.VIEW → puede consultar (200 lógico)', async () => {
    const guard = new RbacGuard(new Reflector());
    const ctx = guardCtx({ id: 'u5', permissions: ['AUDIT.VIEW'] }, 'findEvents');
    expect(guard.canActivate(ctx)).toBe(true);
    const ctrl = new AuditoriaController(svc(mockPrisma()));
    const res: any = await ctrl.findEvents();
    expect(res.total).toBe(2);
  });

  it('4/5. listado real con paginación (skip/take + total)', async () => {
    const prisma = mockPrisma();
    const res: any = await svc(prisma).findEvents({ page: 2, limit: 1 });
    expect(res).toMatchObject({ total: 2, page: 2, limit: 1, totalPages: 2 });
    const args = prisma.calls.findMany[0];
    expect(args.skip).toBe(1);
    expect(args.take).toBe(1);
    expect(prisma.auditEvent.count).toHaveBeenCalledTimes(1);
  });

  it('6. filtro por acción', async () => {
    const prisma = mockPrisma();
    await svc(prisma).findEvents({ action: 'USER_PASSWORD_RESET' });
    expect(prisma.calls.findMany[0].where.action).toBe('USER_PASSWORD_RESET');
  });

  it('7. filtro por actor', async () => {
    const prisma = mockPrisma();
    await svc(prisma).findEvents({ actorId: 'u5' });
    expect(prisma.calls.findMany[0].where.actorId).toBe('u5');
  });

  it('8. filtro por afectado (entityId)', async () => {
    const prisma = mockPrisma();
    const res: any = await svc(prisma).findEvents({ entityId: 'u1' });
    expect(prisma.calls.findMany[0].where.entityId).toBe('u1');
    expect(res.data[0].afectado.displayName).toBe('Juan Pérez');
  });

  it('9/13. filtro por correlationId (operación masiva identificable)', async () => {
    const prisma = mockPrisma();
    const res: any = await svc(prisma).findEvents({ correlationId: 'ABC123' });
    expect(prisma.calls.findMany[0].where.correlationId).toBe('ABC123');
    expect(res.data[0].correlationId).toBe('ABC123');
  });

  it('10. orden descendente por fecha', async () => {
    const prisma = mockPrisma();
    await svc(prisma).findEvents({});
    expect(prisma.calls.findMany[0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('11. detalle con actor seguro y afectado', async () => {
    const res: any = await svc(mockPrisma()).findEventById('e1');
    expect(res.id).toBe('e1');
    expect(res.actor.displayName).toBe('Luis');
    expect(res.actor).not.toHaveProperty('passwordHash');
    expect(res.afectado.displayName).toBe('Juan Pérez');
  });

  it('12. PASSWORD_RESET no expone secretos', async () => {
    const res: any = await svc(mockPrisma()).findEventById('e2');
    const blob = JSON.stringify(res);
    expect(blob).not.toMatch(/passwordHash|Secreta|token|cookie|secret/i);
    expect(res.actor).not.toHaveProperty('passwordHash');
  });

  it('14. consultar no genera eventos', async () => {
    const prisma = mockPrisma();
    const s = svc(prisma);
    await s.findEvents({});
    await s.findEventById('e1');
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });
});
