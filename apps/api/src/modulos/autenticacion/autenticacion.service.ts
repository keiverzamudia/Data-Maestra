import { Injectable, UnauthorizedException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { getInitialPassword } from './initial-password';
import { getJwtSecret, getSessionTtlHours } from './auth.config';
import { resolveEffectivePermissions } from '../../comun/utilidades/permisos-efectivos';
import { LoginDto } from './dto/login.dto';

export interface AuthMembership {
  companyId: string;
  company: { id: string; name: string; code: string };
  departmentId: string | null;
  department: { id: string; name: string; code: string } | null;
  roleCodes: string[];
}

export interface ResolvedSession {
  user: { id: string; displayName: string; active: boolean; mustChangePassword: boolean };
  session: { id: string };
  roleCodes: string[];
  permissions: string[];
  memberships: AuthMembership[];
}

@Injectable()
export class AutenticacionService {
  // PrismaService es @Global: sin ciclos de módulos. La auditoría se escribe
  // directo vía prisma (mismo patrón que solicitud.service) para no crear
  // dependencia circular con AuditoriaModule (que importa AutenticacionModule).
  constructor(private readonly prisma: PrismaService) {}

  // =====================================================================
  // FASE 10D — Autenticación real de credenciales (sin JWT; 10E).
  // =====================================================================

  private async auditAuth(action: string, userId?: string, afterData?: unknown) {
    try {
      await this.prisma.auditEvent.create({
        data: {
          correlationId: randomUUID(),
          actorId: userId,
          entityType: 'Auth',
          entityId: userId ?? 'unknown',
          action,
          afterData: afterData ? JSON.stringify(afterData) : undefined,
        },
      });
    } catch {
      // La auditoría nunca debe romper el flujo de autenticación.
    }
  }

  private async verifyPassword(user: { passwordHash: string | null }, plain: string): Promise<'hash' | 'initial' | null> {
    if (user.passwordHash) {
      return (await bcrypt.compare(plain, user.passwordHash)) ? 'hash' : null;
    }
    const initial = getInitialPassword();
    if (!initial) {
      throw new ServiceUnavailableException('Configuración de contraseña inicial ausente.');
    }
    return plain === initial ? 'initial' : null;
  }

  // =====================================================================
  // FASE 10E — Sesión real + JWT (cookie HttpOnly dm_session).
  // =====================================================================

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private signJwt(userId: string, sessionId: string): string {
    const ttlH = getSessionTtlHours();
    return jwt.sign({ sub: userId, sessionId }, getJwtSecret(), { expiresIn: `${ttlH}h` });
  }

  /** Pertenencia organizacional real: Usuario + Rol + Empresa + Departamento. */
  async getMemberships(userId: string): Promise<AuthMembership[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId, active: true },
      include: {
        role: { select: { code: true } },
        company: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
      },
      orderBy: { companyId: 'asc' },
    });
    const byCompany = new Map<string, AuthMembership>();
    for (const r of rows) {
      let m = byCompany.get(r.companyId);
      if (!m) {
        m = {
          companyId: r.companyId,
          company: r.company,
          departmentId: r.departmentId,
          department: r.department,
          roleCodes: [],
        };
        byCompany.set(r.companyId, m);
      }
      if (!m.roleCodes.includes(r.role.code)) m.roleCodes.push(r.role.code);
      // Sin inventar: si hay varios departamentos en la misma empresa, el
      // primero no nulo NO se impone; se conserva el primero encontrado y el
      // frontend resuelve con selector explícito (10E §5 SolicitudCreate).
      if (!m.departmentId && r.departmentId) {
        m.departmentId = r.departmentId;
        m.department = r.department;
      }
    }
    return Array.from(byCompany.values());
  }

  /**
   * FASE 10F/10G — Permisos efectivos REALES desde BD:
   *   UserRole (activo) → Role → RolePermission → Permission,
   *   más overrides individuales (DENEGADO > CONCEDIDO > HEREDADO).
   * Solo roles activos aportan roleCodes y permisos heredados.
   */
  async getEffectivePermissions(userId: string, companyId?: string): Promise<{ roleCodes: string[]; permissions: string[] }> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId, active: true, ...(companyId ? { companyId } : {}) },
      include: {
        role: {
          select: {
            code: true,
            rolePermissions: { select: { permission: { select: { code: true } } } },
          },
        },
      },
    });
    const overrides = await this.prisma.userPermissionOverride.findMany({
      where: { userId },
      include: { permission: { select: { code: true } } },
    });
    const roleCodes = Array.from(new Set(rows.map(r => r.role.code)));
    const inherited = rows.flatMap(r => (r.role.rolePermissions ?? []).map(rp => rp.permission.code));
    const { permissions } = resolveEffectivePermissions(
      inherited,
      overrides.map(o => ({ code: o.permission.code, effect: o.effect })),
    );
    return { roleCodes, permissions };
  }

  async createSession(userId: string, ip?: string, userAgent?: string) {
    const ttlH = getSessionTtlHours();
    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: 'pending',
        expiresAt: new Date(Date.now() + ttlH * 3600 * 1000),
        ip,
        userAgent,
      },
    });
    const token = this.signJwt(userId, session.id);
    await this.prisma.session.update({
      where: { id: session.id },
      data: { tokenHash: this.hashToken(token) },
    });
    return { sessionId: session.id, token, expiresAt: session.expiresAt };
  }

  /** Valida JWT + Session + User. null = 401. Nunca expone el token. */
  async resolveSession(token: string): Promise<ResolvedSession | null> {
    let payload: { sub: string; sessionId: string };
    try {
      payload = jwt.verify(token, getJwtSecret()) as { sub: string; sessionId: string };
    } catch {
      return null;
    }
    if (!payload?.sub || !payload?.sessionId) return null;
    const session = await this.prisma.session.findUnique({ where: { id: payload.sessionId } });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;
    if (session.tokenHash !== this.hashToken(token)) return null;
    if (session.userId !== payload.sub) return null;
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || !user.active) return null;
    const { roleCodes, permissions } = await this.getEffectivePermissions(user.id);
    const memberships = await this.getMemberships(user.id);
    return {
      user: { id: user.id, displayName: user.displayName, active: user.active, mustChangePassword: user.mustChangePassword },
      session: { id: session.id },
      roleCodes,
      permissions,
      memberships,
    };
  }

  async logout(sessionId: string, actorId?: string) {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.revokedAt) return { ok: true };
    await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    await this.auditAuth('LOGOUT', session.userId, { sessionId });
    await this.auditAuth('SESSION_REVOCADA', actorId ?? session.userId, { sessionId });
    return { ok: true };
  }

  async revokeAllSessions(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async loginReal(dto: LoginDto, ip?: string, userAgent?: string) {
    const generic = 'Usuario o contraseña incorrectos.';
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user || !user.active) {
      await this.auditAuth('LOGIN_FALLIDO', dto.userId, { reason: !user ? 'unknown_user' : 'inactive' });
      throw new UnauthorizedException(generic);
    }

    let verified: 'hash' | 'initial' | null = null;
    try {
      verified = await this.verifyPassword(user, dto.password);
    } catch (e: any) {
      if (e instanceof ServiceUnavailableException) throw e;
      verified = null;
    }
    if (!verified) {
      await this.auditAuth('LOGIN_FALLIDO', user.id, { reason: 'bad_password' });
      throw new UnauthorizedException(generic);
    }

    // Primer login con inicial: se materializa el hash; mustChangePassword
    // sigue true y passwordChangedAt permanece null (10D §6/§16).
    const data: { lastLoginAt: Date; passwordHash?: string } = { lastLoginAt: new Date() };
    if (verified === 'initial') {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    await this.prisma.user.update({ where: { id: user.id }, data });
    const created = await this.createSession(user.id, ip, userAgent);
    await this.auditAuth('LOGIN_EXITOSO', user.id, { mustChangePassword: user.mustChangePassword, sessionId: created.sessionId });

    return {
      authenticated: true,
      user: { id: user.id, displayName: user.displayName, active: user.active },
      mustChangePassword: user.mustChangePassword,
      // token solo en memoria para que el controller lo ponga en cookie HttpOnly.
      // Nunca se registra en logs ni se persiste en claro.
      token: created.token,
      expiresAt: created.expiresAt,
      sessionId: created.sessionId,
    };
  }

  /**
   * FASE 10E — Cambio con identidad de sesión (corrección #11).
   * El userId proviene de request.user, NO del body.
   */
  async cambiarPasswordSesion(authUserId: string, dto: { currentPassword: string; newPassword: string }) {
    const generic = 'No se pudo cambiar la contraseña.';
    const user = await this.prisma.user.findUnique({ where: { id: authUserId } });
    if (!user || !user.active) {
      await this.auditAuth('CAMBIO_PASSWORD_FALLIDO', authUserId, { reason: !user ? 'unknown_user' : 'inactive' });
      throw new UnauthorizedException(generic);
    }

    let verified: 'hash' | 'initial' | null = null;
    try {
      verified = await this.verifyPassword(user, dto.currentPassword);
    } catch (e: any) {
      if (e instanceof ServiceUnavailableException) throw e;
      verified = null;
    }
    if (!verified) {
      await this.auditAuth('CAMBIO_PASSWORD_FALLIDO', user.id, { reason: 'bad_current' });
      throw new UnauthorizedException('Usuario o contraseña actual incorrectos.');
    }

    // Nueva diferente a la anterior (contra hash o contra inicial).
    if (!dto.newPassword || dto.newPassword.length < 8) {
      throw new UnauthorizedException('La nueva contraseña debe tener al menos 8 caracteres.');
    }    if (user.passwordHash) {
      if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
        throw new UnauthorizedException('La nueva contraseña debe ser diferente a la actual.');
      }
    } else if (dto.newPassword === dto.currentPassword) {
      throw new UnauthorizedException('La nueva contraseña debe ser diferente a la actual.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, 10),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });
    // Corrección #12: al cambiar, se revocan TODAS las sesiones (incluida la
    // actual). El frontend vuelve a LoginPage.
    await this.revokeAllSessions(user.id);
    await this.auditAuth('CAMBIO_PASSWORD', user.id, { mustChangePassword: false });
    await this.auditAuth('SESSION_REVOCADA', user.id, { reason: 'password_change' });
    return { ok: true };
  }

  /** Autocomplete del login: solo activos, solo id+displayName. */
  async listarUsuariosLogin(search?: string, limit = 20) {
    return this.prisma.user.findMany({
      where: {
        active: true,
        ...(search ? { displayName: { contains: search } } : {}),
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
      take: Math.min(Math.max(limit, 1), 50),
    });
  }

  // =====================================================================
  // FASE 10E — Contexto organizacional (punto preparado para 10F).
  // companyId del frontend = contexto funcional, NUNCA autoridad.
  // Aquí solo se verifica PERTENENCIA (membership activa); la autorización
  // fina por empresa/departamento/permiso queda para 10F.
  // =====================================================================

  /** Resuelve la empresa de contexto: explícita validada o única membresía. */
  async resolveCompanyContext(userId: string, companyId?: string): Promise<string> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId, active: true },
      select: { companyId: true },
    });
    const companies = Array.from(new Set(rows.map(r => r.companyId)));
    if (companyId) {
      if (!companies.includes(companyId)) {
        throw new ForbiddenException('Sin pertenencia activa en la empresa indicada.');
      }
      return companyId;
    }
    if (companies.length === 1) return companies[0]!;
    throw new ForbiddenException(
      companies.length === 0
        ? 'Usuario sin pertenencia organizacional activa.'
        : 'Múltiples empresas: indique companyId explícito.',
    );
  }

  /** Valida que empresa+departamento correspondan a una membresía activa real. */
  async requireDepartmentMembership(userId: string, companyId: string, departmentId: string): Promise<void> {
    const membership = await this.prisma.userRole.findFirst({
      where: { userId, companyId, departmentId, active: true },
    });
    if (!membership) {
      throw new ForbiddenException('Sin pertenencia activa en la empresa/departamento indicados.');
    }
    // Defensa en profundidad: el departamento debe ser de esa empresa.
    const dept = await this.prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept || dept.companyId !== companyId) {
      throw new ForbiddenException('Departamento no pertenece a la empresa indicada.');
    }
  }
}
