import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { AutenticacionService } from '../src/modulos/autenticacion/autenticacion.service';
import { getInitialPassword } from '../src/modulos/autenticacion/initial-password';

const INITIAL = getInitialPassword();

function createMocks() {
  const db = {
    uOk: { id: 'u-ok', displayName: 'USUARIO OK', active: true, passwordHash: bcrypt.hashSync('Secreta123', 4), mustChangePassword: false, lastLoginAt: null, passwordChangedAt: new Date() },
    uNew: { id: 'u-new', displayName: 'USUARIO NUEVO', active: true, passwordHash: null, mustChangePassword: true, lastLoginAt: null, passwordChangedAt: null },
    uOff: { id: 'u-off', displayName: 'USUARIO OFF', active: false, passwordHash: bcrypt.hashSync('Secreta123', 4), mustChangePassword: false, lastLoginAt: null, passwordChangedAt: null },
  };
  const prisma: any = {
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        const u = Object.values(db).find(x => x.id === where.id);
        return u ? { ...u } : null;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const u = (Object.values(db) as any[]).find(x => x.id === where.id);
        Object.assign(u, data);
        return { ...u };
      }),
      findMany: vi.fn(async ({ where, select }: any) => {
        expect(select).not.toHaveProperty('passwordHash');
        return Object.values(db)
          .filter(u => u.active && (!where.displayName || u.displayName.includes(where.displayName.contains)))
          .map(u => ({ id: u.id, displayName: u.displayName }));
      }),
    },
    auditEvent: { create: vi.fn(async ({ data }: any) => ({ id: 'a1', ...data })) },
    session: {
      create: vi.fn(async ({ data }: any) => ({ id: 's1', revokedAt: null, ...data })),
      update: vi.fn(async ({ data }: any) => data),
      findUnique: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  return { prisma, db };
}

describe('FASE 10D — login real', () => {
  beforeEach(() => vi.clearAllMocks());

  it('1. login correcto con hash', async () => {
    const { prisma } = createMocks();
    const svc = new AutenticacionService(prisma);
    const r = await svc.loginReal({ userId: 'u-ok', password: 'Secreta123' });
    expect(r).toMatchObject({ authenticated: true, mustChangePassword: false });
    expect(r.user).toEqual({ id: 'u-ok', displayName: 'USUARIO OK', active: true });
  });

  it('2/3/4. contraseña incorrecta, usuario inexistente e inactivo → genérico', async () => {
    const { prisma } = createMocks();
    const svc = new AutenticacionService(prisma);
    await expect(svc.loginReal({ userId: 'u-ok', password: 'otra' })).rejects.toThrow('Usuario o contraseña incorrectos.');
    await expect(svc.loginReal({ userId: 'nadie', password: 'x' })).rejects.toThrow('Usuario o contraseña incorrectos.');
    await expect(svc.loginReal({ userId: 'u-off', password: 'Secreta123' })).rejects.toThrow('Usuario o contraseña incorrectos.');
  });

  it('5/7/8. primer login con inicial: hash materializado, mcp=true, passwordChangedAt=null', async () => {
    const { prisma, db } = createMocks();
    const svc = new AutenticacionService(prisma);
    const r = await svc.loginReal({ userId: 'u-new', password: INITIAL });
    expect(r.mustChangePassword).toBe(true);
    expect(db.uNew.passwordHash).toBeTruthy();
    expect(await bcrypt.compare(INITIAL, db.uNew.passwordHash!)).toBe(true);
    expect(db.uNew.passwordChangedAt).toBeNull();
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(['lastLoginAt', 'passwordHash']);
  });

  it('6. primer login con otra contraseña falla', async () => {
    const { prisma, db } = createMocks();
    const svc = new AutenticacionService(prisma);
    await expect(svc.loginReal({ userId: 'u-new', password: 'no-es-inicial' })).rejects.toThrow('Usuario o contraseña incorrectos.');
    expect(db.uNew.passwordHash).toBeNull();
  });

  it('17/18. lastLoginAt solo en éxito', async () => {
    const { prisma, db } = createMocks();
    const svc = new AutenticacionService(prisma);
    await svc.loginReal({ userId: 'u-ok', password: 'Secreta123' });
    expect(db.uOk.lastLoginAt).toBeInstanceOf(Date);
    db.uOk.lastLoginAt = null;
    await expect(svc.loginReal({ userId: 'u-ok', password: 'mal' })).rejects.toThrow();
    expect(db.uOk.lastLoginAt).toBeNull();
  });

  it('9/14. cambio obligatorio correcto actualiza todo', async () => {    const { prisma, db } = createMocks();
    const svc = new AutenticacionService(prisma);
    await svc.loginReal({ userId: 'u-new', password: INITIAL });
    const r = await svc.cambiarPasswordSesion('u-new', { currentPassword: INITIAL, newPassword: 'NuevaClave1' });
    expect(r).toEqual({ ok: true });
    expect(db.uNew.mustChangePassword).toBe(false);
    expect(db.uNew.passwordChangedAt).toBeInstanceOf(Date);
    expect(await bcrypt.compare('NuevaClave1', db.uNew.passwordHash!)).toBe(true);
  }, 30000);

  it('10. cambio con actual incorrecta falla', async () => {
    const { prisma } = createMocks();
    const svc = new AutenticacionService(prisma);
    await expect(svc.cambiarPasswordSesion('u-ok', { currentPassword: 'mal', newPassword: 'NuevaClave1' })).rejects.toThrow();
  });

  it('11. nueva demasiado corta falla', async () => {
    const { prisma } = createMocks();
    const svc = new AutenticacionService(prisma);
    await expect(svc.cambiarPasswordSesion('u-ok', { currentPassword: 'Secreta123', newPassword: 'corta' })).rejects.toThrow(/8 caracteres/);
  });

  it('12. nueva igual a la actual falla (hash y caso inicial)', async () => {
    const { prisma } = createMocks();
    const svc = new AutenticacionService(prisma);
    await expect(svc.cambiarPasswordSesion('u-ok', { currentPassword: 'Secreta123', newPassword: 'Secreta123' })).rejects.toThrow(/diferente/);
    await expect(svc.cambiarPasswordSesion('u-new', { currentPassword: INITIAL, newPassword: INITIAL })).rejects.toThrow(/diferente/);
  });

  it('15/16. posterior: nueva funciona, inicial ya no', async () => {
    const { prisma } = createMocks();
    const svc = new AutenticacionService(prisma);
    await svc.loginReal({ userId: 'u-new', password: INITIAL });
    await svc.cambiarPasswordSesion('u-new', { currentPassword: INITIAL, newPassword: 'NuevaClave1' });
    const r = await svc.loginReal({ userId: 'u-new', password: 'NuevaClave1' });
    expect(r.mustChangePassword).toBe(false);
    await expect(svc.loginReal({ userId: 'u-new', password: INITIAL })).rejects.toThrow('Usuario o contraseña incorrectos.');
  }, 30000);

  it('19. inactivo no puede cambiar contraseña', async () => {
    const { prisma } = createMocks();
    const svc = new AutenticacionService(prisma);
    await expect(svc.cambiarPasswordSesion('u-off', { currentPassword: 'Secreta123', newPassword: 'NuevaClave1' })).rejects.toThrow();
  });

  it('20/21/22. respuesta sin secretos', async () => {
    const { prisma } = createMocks();
    const svc = new AutenticacionService(prisma);
    const r = await svc.loginReal({ userId: 'u-ok', password: 'Secreta123' });
    const json = JSON.stringify(r);
    expect(json).not.toContain('passwordHash');
    expect(json).not.toContain('profitCode');
    expect(json).not.toContain('Secreta123');
    expect(json).not.toContain(INITIAL);
    expect(Object.keys(r.user).sort()).toEqual(['active', 'displayName', 'id']);
  });

  it('autocomplete: solo activos, solo id+displayName, server-side', async () => {
    const { prisma } = createMocks();
    const svc = new AutenticacionService(prisma);
    const rows = await svc.listarUsuariosLogin('USUARIO');
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual({ id: expect.any(String), displayName: expect.any(String) });
    expect(JSON.stringify(rows)).not.toMatch(/profitCode|passwordHash/);
  });

  it('audita LOGIN_EXITOSO, LOGIN_FALLIDO y CAMBIO_PASSWORD sin secretos', async () => {
    const { prisma } = createMocks();
    const svc = new AutenticacionService(prisma);
    await svc.loginReal({ userId: 'u-ok', password: 'Secreta123' });
    await expect(svc.loginReal({ userId: 'u-ok', password: 'mal' })).rejects.toThrow();
    await svc.cambiarPasswordSesion('u-ok', { currentPassword: 'Secreta123', newPassword: 'NuevaClave1' });
    const actions = prisma.auditEvent.create.mock.calls.map((c: any) => c[0].data.action);
    expect(actions).toEqual(['LOGIN_EXITOSO', 'LOGIN_FALLIDO', 'CAMBIO_PASSWORD', 'SESSION_REVOCADA']);
    const all = JSON.stringify(prisma.auditEvent.create.mock.calls);
    expect(all).not.toMatch(/Secreta123|NuevaClave1/);
  });
});
