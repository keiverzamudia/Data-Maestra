import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutenticacionService } from '../src/modulos/autenticacion/autenticacion.service';

/**
 * FASE 15 — login contra MasterProfit.dbo.autenticar().
 * A: válido+válida → ok. B: incorrecta → 401. C: inconsistente → 401.
 * D: inactivo → 401 sin sesión. E: Profit caído → 503 sin sesión.
 * F: la contraseña no se persiste. G/H/I: sin passwordHash/INITIAL/mustChange.
 * M: profitCode siempre desde el usuario local. N: rate limiting.
 */
function createMocks(authImpl?: (code: string, pass: string) => Promise<string | null>) {
  const db = {
    users: [
      { id: 'u-ok', displayName: 'KEIBER ZAMUDIA', active: true, profitCode: 'KZAMU', lastLoginAt: null },
      { id: 'u-nocode', displayName: 'SIN CODIGO', active: true, profitCode: null, lastLoginAt: null },
      { id: 'u-off', displayName: 'USUARIO OFF', active: false, profitCode: 'KZAMU', lastLoginAt: null },
    ] as any[],
    sessions: [] as any[],
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
      findUnique: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    userRole: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
    userPermissionOverride: { findMany: vi.fn(async () => []) },
    auditEvent: { create: vi.fn(async ({ data }: any) => ({ id: 'a1', ...data })) },
  };
  const adapter = {
    autenticarProfit: vi.fn(authImpl ?? (async (code: string, pass: string) => (pass === 'Correcta123' ? code : null))),
  };
  const svc = new AutenticacionService(prisma, adapter as any);
  return { prisma, db, adapter, svc };
}

describe('FASE 15 — autenticación contra Profit', () => {
  beforeEach(() => vi.clearAllMocks());
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-15';

  it('A. válido + válida (id === profitCode) → login correcto', async () => {
    const { svc, adapter } = createMocks();
    const r = await svc.loginReal({ userId: 'u-ok', password: 'Correcta123' });
    expect(r.authenticated).toBe(true);
    expect(r.user).toEqual({ id: 'u-ok', displayName: 'KEIBER ZAMUDIA', active: true });
    expect(r).not.toHaveProperty('mustChangePassword');
    // M: el backend usa el profitCode del usuario local.
    expect(adapter.autenticarProfit).toHaveBeenCalledWith('KZAMU', 'Correcta123');
  });

  it('B. contraseña incorrecta (vacío) → 401 genérico sin sesión', async () => {
    const { svc, prisma } = createMocks();
    await expect(svc.loginReal({ userId: 'u-ok', password: 'mal' })).rejects.toThrow('Usuario o contraseña incorrectos.');
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('C. resultado inconsistente (otro id) → 401 sin sesión', async () => {
    const { svc, prisma } = createMocks(async () => 'OTRO_CODIGO');
    await expect(svc.loginReal({ userId: 'u-ok', password: 'Correcta123' })).rejects.toThrow('Usuario o contraseña incorrectos.');
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('D. inactivo o inexistente o sin profitCode → 401 sin llamar a Profit', async () => {
    const { svc, adapter, prisma } = createMocks();
    await expect(svc.loginReal({ userId: 'u-off', password: 'x' }, '1.1.1.1', 'UA')).rejects.toThrow('Usuario o contraseña incorrectos.');
    await expect(svc.loginReal({ userId: 'nadie', password: 'x' })).rejects.toThrow('Usuario o contraseña incorrectos.');
    await expect(svc.loginReal({ userId: 'u-nocode', password: 'x' })).rejects.toThrow('Usuario o contraseña incorrectos.');
    expect(adapter.autenticarProfit).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('E. Profit caído → 503 fail closed sin sesión', async () => {
    const { svc, prisma } = createMocks(async () => { throw new Error('timeout'); });
    await expect(svc.loginReal({ userId: 'u-ok', password: 'Correcta123' })).rejects.toThrow('No fue posible validar el acceso');
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('F. la contraseña no se persiste ni se registra', async () => {
    const { svc, prisma, db } = createMocks();
    await svc.loginReal({ userId: 'u-ok', password: 'Correcta123' });
    expect(JSON.stringify(db.users[0])).not.toContain('Correcta123');
    const dump = JSON.stringify(prisma.auditEvent.create.mock.calls) + JSON.stringify(db.sessions);
    expect(dump).not.toContain('Correcta123');
    expect(dump).not.toMatch(/passwordHash|password/i);
  });

  it('N. rate limiting bloquea temporalmente sin bloquear para siempre', async () => {
    const { svc } = createMocks();
    for (let i = 0; i < 5; i++) {
      await expect(svc.loginReal({ userId: 'u-ok', password: 'mal' }, '9.9.9.9', 'UA')).rejects.toThrow('Usuario o contraseña incorrectos.');
    }
    await expect(svc.loginReal({ userId: 'u-ok', password: 'mal' }, '9.9.9.9', 'UA')).rejects.toThrow('Demasiados intentos');
    // Otra IP no está bloqueada: sigue respondiendo 401 genérico.
    await expect(svc.loginReal({ userId: 'u-ok', password: 'mal' }, '1.1.1.2', 'UA')).rejects.toThrow('Usuario o contraseña incorrectos.');
  });

  it('auditoría LOGIN_EXITOSO/LOGIN_FALLIDO sin secretos', async () => {
    const { svc, prisma } = createMocks();
    await svc.loginReal({ userId: 'u-ok', password: 'Correcta123' });
    await expect(svc.loginReal({ userId: 'u-ok', password: 'mal' })).rejects.toThrow();
    const actions = prisma.auditEvent.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toEqual(['LOGIN_EXITOSO', 'LOGIN_FALLIDO']);
    expect(JSON.stringify(prisma.auditEvent.create.mock.calls)).not.toContain('Correcta123');
  });

  it('G/H/I. sin mecanismo local en el código', async () => {
    const fs = await import('fs');
    const svcFile = fs.readFileSync('src/modulos/autenticacion/autenticacion.service.ts', 'utf-8');
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
    expect(svcFile).not.toContain('passwordHash');
    expect(svcFile).not.toContain('bcrypt');
    expect(svcFile).not.toContain('INITIAL_PASSWORD');
    expect(svcFile).not.toContain('mustChangePassword');
    expect(svcFile).not.toContain('cambiarPasswordSesion');
    expect(schema).not.toContain('passwordHash');
    expect(schema).not.toContain('mustChangePassword');
    expect(schema).not.toContain('passwordChangedAt');
  });
});
