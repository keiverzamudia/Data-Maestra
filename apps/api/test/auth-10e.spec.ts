import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { AutenticacionService } from '../src/modulos/autenticacion/autenticacion.service';

process.env.JWT_SECRET = 'test-secret-10e';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function createMocks() {
  const db = {
    users: [
      { id: 'u-ok', displayName: 'USUARIO OK', active: true, passwordHash: bcrypt.hashSync('Secreta123', 4), mustChangePassword: false, lastLoginAt: null, passwordChangedAt: null },
      { id: 'u-off', displayName: 'USUARIO OFF', active: false, passwordHash: bcrypt.hashSync('Secreta123', 4), mustChangePassword: false, lastLoginAt: null, passwordChangedAt: null },
    ] as any[],
    sessions: [] as any[],
    userRoles: [
      { userId: 'u-ok', companyId: 'c1', departmentId: 'd1', active: true, role: { code: 'REQUESTER' }, company: { id: 'c1', name: 'Emp', code: 'E' }, department: { id: 'd1', name: 'Compras', code: 'COMPRAS' } },
    ] as any[],
  };
  const prisma: any = {
    user: {
      findUnique: vi.fn(async ({ where }: any) => db.users.find(u => u.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: any) => Object.assign(db.users.find(u => u.id === where.id)!, data)),
    },
    session: {
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `s${db.sessions.length + 1}`, revokedAt: null, ...data };
        db.sessions.push(row);
        return { ...row };
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(db.sessions.find(s => s.id === where.id)!, data)),
      findUnique: vi.fn(async ({ where }: any) => {
        const s = db.sessions.find(x => x.id === where.id);
        return s ? { ...s } : null;
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let n = 0;
        for (const s of db.sessions) {
          if (s.userId === where.userId && (where.revokedAt === undefined || s.revokedAt === where.revokedAt)) {
            Object.assign(s, data);
            n++;
          }
        }
        return { count: n };
      }),
    },
    userRole: {
      findMany: vi.fn(async ({ where }: any) => db.userRoles.filter(r =>
        (!where.userId || r.userId === where.userId) &&
        (where.active === undefined || r.active === where.active) &&
        (!where.companyId || r.companyId === where.companyId),
      )),
      findFirst: vi.fn(async ({ where }: any) => db.userRoles.find(r =>
        r.userId === where.userId && r.companyId === where.companyId &&
        (where.departmentId === undefined || r.departmentId === where.departmentId) &&
        (where.active === undefined || r.active === where.active),
      ) ?? null),
    },
    department: { findUnique: vi.fn(async ({ where }: any) => where.id === 'd1' ? { id: 'd1', companyId: 'c1' } : null) },
    auditEvent: { create: vi.fn(async ({ data }: any) => ({ id: 'a1', ...data })) },
  };
  return { prisma, db };
}

describe('FASE 10E — login crea Session + JWT', () => {
  beforeEach(() => vi.clearAllMocks());

  it('1-5/30. login crea una Session con tokenHash (no token) y expiresAt', async () => {
    const { prisma, db } = createMocks();
    const svc = new AutenticacionService(prisma);
    const r = await svc.loginReal({ userId: 'u-ok', password: 'Secreta123' }, '1.2.3.4', 'UA');
    expect(prisma.session.create).toHaveBeenCalledTimes(1);
    const created = prisma.session.create.mock.calls[0][0].data;
    expect(created.userId).toBe('u-ok');
    expect(created.ip).toBe('1.2.3.4');
    expect(created.userAgent).toBe('UA');
    expect(created.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const stored = db.sessions[0];
    expect(stored.tokenHash).toBe(sha(r.token));
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(r.token);
    expect(r).not.toHaveProperty('accessToken');
  });

  it('6/7. login fallido o inactivo no crea Session', async () => {
    const { prisma } = createMocks();
    const svc = new AutenticacionService(prisma);
    await expect(svc.loginReal({ userId: 'u-ok', password: 'mal' })).rejects.toThrow();
    await expect(svc.loginReal({ userId: 'u-off', password: 'Secreta123' })).rejects.toThrow();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('8. JWT válido + sesión vigente autentica', async () => {
    const { prisma } = createMocks();
    const svc = new AutenticacionService(prisma);
    const r = await svc.loginReal({ userId: 'u-ok', password: 'Secreta123' });
    const resolved = await svc.resolveSession(r.token);
    expect(resolved!.user.id).toBe('u-ok');
    expect(resolved!.session.id).toBe(r.sessionId);
    expect(resolved!.permissions).toContain('REQUEST.CREATE');
  });

  it('9/10. JWT expirado o inválido se rechaza', async () => {
    const { prisma } = createMocks();
    const svc = new AutenticacionService(prisma);
    const expired = jwt.sign({ sub: 'u-ok', sessionId: 's9' }, 'test-secret-10e', { expiresIn: '-1h' });
    expect(await svc.resolveSession(expired)).toBeNull();
    expect(await svc.resolveSession('no-es-jwt')).toBeNull();
    expect(await svc.resolveSession(jwt.sign({ sub: 'u-ok' }, 'test-secret-10e'))).toBeNull();
  });

  it('11/12/19. sesión revocada o expirada rechaza', async () => {
    const { prisma, db } = createMocks();
    const svc = new AutenticacionService(prisma);
    const r = await svc.loginReal({ userId: 'u-ok', password: 'Secreta123' });
    await svc.logout(r.sessionId, 'u-ok');
    expect(db.sessions[0].revokedAt).toBeInstanceOf(Date);
    expect(await svc.resolveSession(r.token)).toBeNull();
    // Doble logout idempotente
    await expect(svc.logout(r.sessionId, 'u-ok')).resolves.toEqual({ ok: true });
    db.sessions[0].revokedAt = null;
    db.sessions[0].expiresAt = new Date(Date.now() - 1000);
    expect(await svc.resolveSession(r.token)).toBeNull();
  });

  it('13/14. usuario inexistente o inactivo rechaza aunque la sesión exista', async () => {
    const { prisma, db } = createMocks();
    const svc = new AutenticacionService(prisma);
    const r = await svc.loginReal({ userId: 'u-ok', password: 'Secreta123' });
    db.users.splice(0, db.users.length);
    expect(await svc.resolveSession(r.token)).toBeNull();
  });

  it('21/22. cambio usa identidad de sesión (sin userId en body)', async () => {
    const { prisma, db } = createMocks();
    const svc = new AutenticacionService(prisma);
    const r = await svc.cambiarPasswordSesion('u-ok', { currentPassword: 'Secreta123', newPassword: 'NuevaClave1' });
    expect(r).toEqual({ ok: true });
    expect(await bcrypt.compare('NuevaClave1', db.users[0].passwordHash)).toBe(true);
    expect(db.users[0].mustChangePassword).toBe(false);
    expect(db.users[0].passwordChangedAt).toBeInstanceOf(Date);
  });

  it('cambio revoca todas las sesiones del usuario', async () => {
    const { prisma, db } = createMocks();
    const svc = new AutenticacionService(prisma);
    const r1 = await svc.loginReal({ userId: 'u-ok', password: 'Secreta123' });
    const r2 = await svc.loginReal({ userId: 'u-ok', password: 'Secreta123' });
    await svc.cambiarPasswordSesion('u-ok', { currentPassword: 'Secreta123', newPassword: 'NuevaClave1' });
    expect(await svc.resolveSession(r1.token)).toBeNull();
    expect(await svc.resolveSession(r2.token)).toBeNull();
    expect(db.sessions.every((s: any) => s.revokedAt instanceof Date)).toBe(true);
  });

  it('26-29. auditoría sin secretos y JWT nunca en claro en BD', async () => {
    const { prisma, db } = createMocks();
    const svc = new AutenticacionService(prisma);
    const r = await svc.loginReal({ userId: 'u-ok', password: 'Secreta123' });
    await svc.logout(r.sessionId, 'u-ok');
    const actions = prisma.auditEvent.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toContain('LOGIN_EXITOSO');
    expect(actions).toContain('LOGOUT');
    expect(actions).toContain('SESSION_REVOCADA');
    const dump = JSON.stringify(prisma.auditEvent.create.mock.calls) + JSON.stringify(db.sessions);
    expect(dump).not.toContain(r.token);
    expect(dump).not.toContain('Secreta123');
    expect(dump).not.toContain('test-secret-10e');
  });

  it('16/17. sin rastro de userId global ni cambio de identidad', async () => {
    const fs = await import('fs');
    const ctrl = fs.readFileSync('src/modulos/autenticacion/autenticacion.controller.ts', 'utf-8');
    const svcFile = fs.readFileSync('src/modulos/autenticacion/autenticacion.service.ts', 'utf-8');
    expect(ctrl).not.toMatch(/Query\('userId'\)|Param\('userId'\)/);
    expect(svcFile).not.toContain('currentUserId');
    expect(svcFile).not.toContain('setCurrentUser');
  });
});

describe('FASE 10E — guards', () => {
  function ctxWith(req: any, perms: string[] | null) {
    const reflector: any = { getAllAndOverride: () => perms };
    const context: any = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    return { reflector, context };
  }

  it('JwtGuard: cookie válida adjunta request.user real; sin cookie 401', async () => {
    const { JwtGuard } = await import('../src/modulos/autenticacion/jwt.guard');
    const resolved = { user: { id: 'u-ok', displayName: 'X' }, session: { id: 's1' }, roleCodes: ['REQUESTER'], permissions: ['REQUEST.VIEW'], memberships: [] };
    const auth: any = { resolveSession: vi.fn(async (t: string) => (t === 'JWT-OK' ? resolved : null)) };
    const guard = new JwtGuard(auth);
    const req: any = { cookies: { dm_session: 'JWT-OK' } };
    const { context } = ctxWith(req, null);
    expect(await guard.canActivate(context)).toBe(true);
    expect(req.user.id).toBe('u-ok');
    const bad: any = { cookies: {} };
    await expect(guard.canActivate(ctxWith(bad, null).context)).rejects.toThrow(/Sesión requerida/);
    const invalid: any = { cookies: { dm_session: 'JWT-MAL' } };
    await expect(guard.canActivate(ctxWith(invalid, null).context)).rejects.toThrow(/inválida/);
  });

  it('RbacGuard: 403 sin permiso, pasa con permiso, 401 sin identidad', async () => {
    const { RbacGuard } = await import('../src/modulos/autenticacion/rbac.guard');
    const req: any = { user: { id: 'u-ok', permissions: ['REQUEST.VIEW'] } };
    const mkGuard = (perms: string[]) => {
      const reflector: any = { getAllAndOverride: () => perms };
      return new RbacGuard(reflector);
    };
    const ctx = (r: any): any => ({ switchToHttp: () => ({ getRequest: () => r }), getHandler: () => ({}), getClass: () => ({}) });
    expect(mkGuard(['REQUEST.VIEW']).canActivate(ctx(req))).toBe(true);
    expect(() => mkGuard(['ADMIN.MANAGE']).canActivate(ctx(req))).toThrow(/ADMIN.MANAGE/);
    expect(() => mkGuard(['X']).canActivate(ctx({}))).toThrow(/Sesión requerida/);
  });
});
