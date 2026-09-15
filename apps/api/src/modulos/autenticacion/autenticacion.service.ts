import { Injectable, UnauthorizedException, ForbiddenException, ServiceUnavailableException, HttpException, HttpStatus, Inject, forwardRef, Optional } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { ProfitAdapterService } from '../profit/profit-adapter.service';
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
  user: { id: string; displayName: string; active: boolean };
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
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(forwardRef(() => ProfitAdapterService))
    private readonly profitAdapter?: ProfitAdapterService,
  ) {}

  // =====================================================================
  // FASE 15 — La contraseña se valida contra Profit, nunca local.
  // Rate limiting en memoria: 5 fallos / 60s por IP+usuario → bloqueo 60s.
  // Sin bloqueos permanentes (un atacante no puede bloquear a otro usuario).
  // =====================================================================
  private readonly loginFailures = new Map<string, { count: number; blockedUntil: number }>();
  private static readonly LOGIN_MAX_FAILURES = 5;
  private static readonly LOGIN_WINDOW_MS = 60_000;

  private rateLimitKey(ip: string | undefined, userId: string): string {
    return `${ip ?? '?'}:${userId}`;
  }

  private checkRateLimit(ip: string | undefined, userId: string): void {
    const entry = this.loginFailures.get(this.rateLimitKey(ip, userId));
    if (entry && entry.blockedUntil > Date.now()) {
      throw new HttpException('Demasiados intentos. Inténtalo nuevamente.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private registerLoginFailure(ip: string | undefined, userId: string): void {
    if (this.loginFailures.size > 5000) this.loginFailures.clear();
    const key = this.rateLimitKey(ip, userId);
    const entry = this.loginFailures.get(key) ?? { count: 0, blockedUntil: 0 };
    entry.count += 1;
    if (entry.count >= AutenticacionService.LOGIN_MAX_FAILURES) {
      entry.blockedUntil = Date.now() + AutenticacionService.LOGIN_WINDOW_MS;
      entry.count = 0;
    }
    this.loginFailures.set(key, entry);
  }

  private clearLoginFailures(ip: string | undefined, userId: string): void {
    this.loginFailures.delete(this.rateLimitKey(ip, userId));
  }

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

  // =====================================================================
  // FASE 15 — Verificación contra MasterProfit.dbo.autenticar().
  // La contraseña solo existe en este scope y se descarta al retornar.
  // Retorna true solo si el id devuelto coincide EXACTAMENTE con el
  // profitCode esperado. Vacío o diferente → false. Fall closed ante
  // errores de infraestructura (lanza, nunca autentica).
  // =====================================================================

  private async verifyProfitPassword(profitCode: string, plain: string): Promise<boolean> {
    const expected = (profitCode ?? '').trim();
    if (!expected || !plain) return false;
    // Sin adapter no hay verificación posible: fail closed.
    if (!this.profitAdapter) {
      throw new ServiceUnavailableException('No fue posible validar el acceso. Inténtalo nuevamente.');
    }
    const returnedId = await this.profitAdapter.autenticarProfit(expected, plain);
    return returnedId !== null && returnedId === expected;
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
      user: { id: user.id, displayName: user.displayName, active: user.active },
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

  /**
   * FASE 15 — Login contra Profit.
   * 1. Usuario local existe y activo (sin esto, ni se intenta Profit).
   * 2. profitCode real desde DB local (jamás del frontend).
   * 3. autenticar(profitCode, password) contra Profit; la contraseña se
   *    descarta al terminar este método (nunca se persiste ni registra).
   * 4. Solo si returnedId === expectedProfitCode se crea la sesión.
   * Mensaje genérico siempre; infraestructura → 503 fail closed.
   */
  async loginReal(dto: LoginDto, ip?: string, userAgent?: string) {
    const generic = 'Usuario o contraseña incorrectos.';
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user || !user.active) {
      await this.auditAuth('LOGIN_FALLIDO', dto.userId, { reason: !user ? 'unknown_user' : 'inactive' });
      throw new UnauthorizedException(generic);
    }
    this.checkRateLimit(ip, dto.userId);

    const expectedProfitCode = (user.profitCode ?? '').trim();
    if (!expectedProfitCode) {
      await this.auditAuth('LOGIN_FALLIDO', user.id, { reason: 'no_profit_code' });
      this.registerLoginFailure(ip, dto.userId);
      throw new UnauthorizedException(generic);
    }

    let ok = false;
    try {
      ok = await this.verifyProfitPassword(expectedProfitCode, dto.password);
    } catch {
      await this.auditAuth('LOGIN_FALLIDO', user.id, { reason: 'profit_unavailable' });
      throw new ServiceUnavailableException('No fue posible validar el acceso. Inténtalo nuevamente.');
    }
    if (!ok) {
      await this.auditAuth('LOGIN_FALLIDO', user.id, { reason: 'bad_password' });
      this.registerLoginFailure(ip, dto.userId);
      throw new UnauthorizedException(generic);
    }

    this.clearLoginFailures(ip, dto.userId);
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const created = await this.createSession(user.id, ip, userAgent);
    await this.auditAuth('LOGIN_EXITOSO', user.id, { sessionId: created.sessionId });

    return {
      authenticated: true,
      user: { id: user.id, displayName: user.displayName, active: user.active },
      // token solo en memoria para que el controller lo ponga en cookie HttpOnly.
      // Nunca se registra en logs ni se persiste en claro.
      token: created.token,
      expiresAt: created.expiresAt,
      sessionId: created.sessionId,
    };
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
