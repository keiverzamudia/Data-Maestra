import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

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
