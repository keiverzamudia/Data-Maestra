import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import {
  ROLE_VIEWS,
  ROLE_VIEW_KEYS,
  isRoleViewKey,
  resolveDefaultView,
  type RoleViewDef,
  type RoleViewKey,
} from './role-default-view';

/**
 * 10I — Administración de roles y sus permisos (solo ADMIN.MANAGE en controller).
 * El catálogo de roles/permisos es controlado por el sistema: aquí solo se
 * administran los vínculos RolePermission. Nunca toca overrides (10G) ni Profit.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly authService?: AutenticacionService,
  ) {}

  private async requireRole(code: string) {
    const role = await this.prisma.role.findUnique({ where: { code } });
    if (!role) throw new NotFoundException('Rol no encontrado.');
    return role;
  }

  private async requirePermission(code: string) {
    const permission = await this.prisma.permission.findUnique({ where: { code } });
    if (!permission) throw new NotFoundException('Permiso no encontrado.');
    return permission;
  }

  /** Lista roles con conteos y permisos asignados (sin datos sensibles). */
  async listRoles() {
    const roles = await this.prisma.role.findMany({
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        defaultView: true,
        rolePermissions: {
          select: { permission: { select: { code: true } } },
          orderBy: { permission: { code: 'asc' } },
        },
        userRoles: { where: { active: true }, select: { userId: true } },
      },
    });
    return roles.map(r => ({
      code: r.code,
      name: r.name,
      description: r.description,
      defaultView: (r as { defaultView?: string | null }).defaultView ?? null,
      userCount: new Set(r.userRoles.map(u => u.userId)).size,
      permissionCount: r.rolePermissions.length,
      permissions: r.rolePermissions.map(rp => rp.permission.code),
    }));
  }

  /** Detalle: permisos + usuarios con el rol (sin passwordHash). */
  async getRole(code: string) {
    const role = await this.prisma.role.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        defaultView: true,
        rolePermissions: {
          select: { permission: { select: { code: true, description: true } } },
          orderBy: { permission: { code: 'asc' } },
        },
        userRoles: {
          where: { active: true },
          select: {
            user: { select: { displayName: true, username: true, active: true } },
            company: { select: { code: true, name: true } },
            department: { select: { code: true, name: true } },
          },
          orderBy: { user: { displayName: 'asc' } },
        },
      },
    });
    if (!role) throw new NotFoundException('Rol no encontrado.');
    const catalog = await this.prisma.permission.findMany({
      orderBy: { code: 'asc' },
      select: { code: true, description: true },
    });
    return {
      code: role.code,
      name: role.name,
      description: role.description,
      defaultView: (role as { defaultView?: string | null }).defaultView ?? null,
      availableViews: ROLE_VIEW_KEYS.map(k => ROLE_VIEWS[k]),
      permissions: role.rolePermissions.map(rp => rp.permission),
      catalog,
      users: role.userRoles.map(m => ({
        displayName: m.user.displayName,
        username: m.user.username,
        active: m.user.active,
        company: m.company?.code ?? null,
        department: m.department?.code ?? null,
      })),
    };
  }

  /** Concede permiso a rol. Idempotente: si ya existe no duplica ni audita de más. */
  async grantPermission(roleCode: string, permissionCode: string, actorId: string, actorCompanyId?: string) {
    const role = await this.requireRole(roleCode);
    const permission = await this.requirePermission(permissionCode);
    const existing = await this.prisma.rolePermission.findUnique({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
    });
    if (existing) return { ok: true, created: false };
    await this.prisma.rolePermission.create({
      data: { roleId: role.id, permissionId: permission.id },
    });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      actorCompanyId,
      entityType: 'Role',
      entityId: role.id,
      action: 'ROLE_PERMISSION_GRANTED',
      afterData: JSON.stringify({ roleCode: role.code, permissionCode: permission.code }),
    });
    return { ok: true, created: true };
  }

  /**
   * Quita permiso de rol. Idempotente y seguro: si no existe, ok sin cambios.
   * Protección último administrador (§8): quitar ADMIN.MANAGE se bloquea con 403
   * si ningún otro usuario lo conservaría por otro rol u override CONCEDIDO.
   */
  async removePermission(roleCode: string, permissionCode: string, actorId: string, actorCompanyId?: string) {
    const role = await this.requireRole(roleCode);
    const permission = await this.requirePermission(permissionCode);
    const existing = await this.prisma.rolePermission.findUnique({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
    });
    if (!existing) return { ok: true, removed: false };
    if (permission.code === 'ADMIN.MANAGE') {
      await this.assertAdminSurvives(role.id);
    }
    await this.prisma.rolePermission.delete({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
    });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      actorCompanyId,
      entityType: 'Role',
      entityId: role.id,
      action: 'ROLE_PERMISSION_REMOVED',
      beforeData: JSON.stringify({ roleCode: role.code, permissionCode: permission.code }),
    });
    return { ok: true, removed: true };
  }

  /**
   * FASE 18 §10/§24 — Vista principal del rol (solo ADMIN.MANAGE en
   * controller). Whitelist de vistas reales; null limpia (fallback).
   * La vista no concede permisos: solo orienta la navegación inicial.
   */
  async setDefaultView(roleCode: string, view: string | null, actorId: string, actorCompanyId?: string) {
    const role = await this.requireRole(roleCode);
    if (view !== null && !isRoleViewKey(view)) {
      throw new BadRequestException(`Vista inválida: "${view}".`);
    }
    await this.prisma.role.update({ where: { id: role.id }, data: { defaultView: view } as never });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      actorCompanyId,
      entityType: 'Role',
      entityId: role.id,
      action: 'ROLE_DEFAULT_VIEW_CHANGED',
      afterData: JSON.stringify({ roleCode: role.code, defaultView: view }),
    });
    return { ok: true, roleCode: role.code, defaultView: view };
  }

  /**
   * Vista principal resuelta para el usuario autenticado (§9/§11-§12).
   * Sin vista con permiso → fallback Mis solicitudes. Nunca otorga permisos.
   */
  async myDefaultView(userId: string): Promise<RoleViewDef> {
    const memberships = await this.prisma.userRole.findMany({
      where: { userId, active: true },
      select: { role: { select: { code: true, defaultView: true } } },
    });
    const roleViews = memberships.map(m => ({
      roleCode: m.role.code,
      defaultView: isRoleViewKey((m.role as { defaultView?: unknown }).defaultView)
        ? ((m.role as { defaultView?: RoleViewKey }).defaultView as RoleViewKey)
        : null,
    }));
    let permissions: string[] = [];
    if (this.authService) {
      try {
        const eff = await this.authService.getEffectivePermissions(userId);
        permissions = eff.permissions ?? [];
      } catch {
        permissions = [];
      }
    }
    const has = (p: string): boolean => permissions.includes(p);
    return resolveDefaultView(roleViews, has);
  }

  /**
   * Backend: detecta si quitar un vínculo dejaría al sistema sin ADMIN.MANAGE.
   * Considera roles restantes y overrides individuales CONCEDIDO.
   */
  private async assertAdminSurvives(excludingRoleId: string) {
    const viaRoles = await this.prisma.userRole.findMany({
      where: {
        active: true,
        roleId: { not: excludingRoleId },
        role: { rolePermissions: { some: { permission: { code: 'ADMIN.MANAGE' } } } },
        user: { active: true },
      },
      select: { userId: true },
    });
    const viaOverrides = await this.prisma.userPermissionOverride.findMany({
      where: { effect: 'GRANT', permission: { code: 'ADMIN.MANAGE' }, user: { active: true } },
      select: { userId: true },
    });
    const holders = new Set([...viaRoles, ...viaOverrides].map(r => r.userId));
    if (holders.size === 0) {
      throw new ForbiddenException(
        'No se puede quitar ADMIN.MANAGE: dejaría al sistema sin ningún administrador.',
      );
    }
  }
}
