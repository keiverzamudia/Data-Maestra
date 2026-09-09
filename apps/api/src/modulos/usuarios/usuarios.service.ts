import { Injectable, ServiceUnavailableException, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { ProfitAdapterService, ProfitUser } from '../profit/profit-adapter.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { resolveEffectivePermissions, type EffectivePermissionDetail } from '../../comun/utilidades/permisos-efectivos';

export interface ProfitUserSyncResult {
  runId: string;
  created: number;
  updated: number;
  missing: number;
  errors: number;
  totalProfit: number;
}

/**
 * FASE 10C — Sincronización READ-ONLY Profit → usuarios locales.
 *
 * Reglas:
 * - Nuevo en Profit → crea usuario local (profitCode, displayName, defaults 10B).
 *   NO genera contraseña (10D); passwordHash queda NULL (no puede autenticarse).
 * - Existente → actualiza SOLO displayName. Nunca toca passwordHash,
 *   mustChangePassword, roles, permisos, overrides, empresa, departamento,
 *   auditoría, lastLoginAt ni passwordChangedAt.
 * - Ausente de VUSUARIOS → active=false (conserva historia). Nunca elimina.
 *   Nunca reactiva por otra fuente.
 * - Reaparece en VUSUARIOS tras haber sido desactivado por el sync
 *   → active=true (reactivación solo vía sincronización, §8 10C).
 *   NOTA: una desactivación manual administrativa de un usuario que sigue en
 *   VUSUARIOS será revertida por el próximo sync; pendiente regla fina en 10H.
 * - Idempotente: re-ejecutar sin cambios en Profit produce 0 cambios.
 */
@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profitAdapter: ProfitAdapterService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async synchronize(actorId?: string, actorCompanyId?: string): Promise<ProfitUserSyncResult> {
    const run = await this.prisma.profitUserSyncRun.create({ data: {} });

    let profitUsers: ProfitUser[];
    try {
      profitUsers = await this.profitAdapter.getProfitUsers();
    } catch (e: any) {
      const details = JSON.stringify({ fatal: e?.message ?? 'Profit unavailable' });
      await this.prisma.profitUserSyncRun.update({
        where: { id: run.id },
        data: { finishedAt: new Date(), errors: 1, details },
      });
      await this.auditoria.logEvent({
        correlationId: run.id,
        actorId,
        actorCompanyId,
        entityType: 'ProfitUserSync',
        entityId: run.id,
        action: 'PROFIT_USER_SYNC_FAILED',
        afterData: details,
      });
      throw new ServiceUnavailableException(`ProfitUserSync failed: ${e?.message ?? 'Profit unavailable'}`);
    }

    const seen = new Map<string, string>();
    for (const u of profitUsers) {
      if (u.profitCode && u.displayName && !seen.has(u.profitCode)) {
        seen.set(u.profitCode, u.displayName);
      }
    }

    const local = await this.prisma.user.findMany({
      where: { profitCode: { not: null } },
      select: { id: true, profitCode: true, displayName: true, active: true },
    });
    const byCode = new Map<string, (typeof local)[number]>();
    for (const u of local) {
      if (u.profitCode) byCode.set(u.profitCode, u);
    }

    let created = 0;
    let updated = 0;
    let missing = 0;
    const errorList: string[] = [];
    const createdCodes: string[] = [];
    const updatedCodes: string[] = [];
    const missingCodes: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const [code, name] of seen) {
        const existing = byCode.get(code);
        try {
          if (!existing) {
            await tx.user.create({
              data: { username: code, displayName: name, profitCode: code, active: true },
            });
            created += 1;
            createdCodes.push(code);
          } else {
            const patch: Record<string, unknown> = {};
            if (existing.displayName !== name) patch.displayName = name;
            // Reactivación solo vía sync: volvió a aparecer en VUSUARIOS.
            if (!existing.active) patch.active = true;
            if (Object.keys(patch).length > 0) {
              await tx.user.update({ where: { id: existing.id }, data: patch });
              updated += 1;
              updatedCodes.push(code);
            }
          }
        } catch (e: any) {
          errorList.push(`${code}: ${e?.message ?? 'error'}`);
        }
      }

      for (const u of local) {
        if (u.profitCode && !seen.has(u.profitCode) && u.active) {
          try {
            await tx.user.update({ where: { id: u.id }, data: { active: false } });
            missing += 1;
            missingCodes.push(u.profitCode);
          } catch (e: any) {
            errorList.push(`${u.profitCode}: ${e?.message ?? 'error'}`);
          }
        }
      }
    });

    const details = JSON.stringify({
      totalProfit: seen.size,
      createdCodes,
      updatedCodes,
      missingCodes,
      errors: errorList,
    });
    await this.prisma.profitUserSyncRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), created, updated, missing, errors: errorList.length, details },
    });
    await this.auditoria.logEvent({
      correlationId: run.id,
      actorId,
      actorCompanyId,
      entityType: 'ProfitUserSync',
      entityId: run.id,
      action: 'PROFIT_USER_SYNC',
      afterData: JSON.stringify({ created, updated, missing, errors: errorList.length, totalProfit: seen.size }),
    });

    return { runId: run.id, created, updated, missing, errors: errorList.length, totalProfit: seen.size };
  }

  /**
   * Búsqueda local para administración y login. Nunca expone passwordHash.
   * Server-side: filtra por displayName, username o profitCode (contains).
   * Incluye membresías activas (empresa/departamento/rol) para la tabla /admin.
   * Sin filtrar por active: el admin debe ver también inactivados por el sync.
   */
  async searchLocal(search?: string, profitCode?: string, limit = 20) {
    const q = search?.trim() ? search.trim() : undefined;
    return this.prisma.user.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { displayName: { contains: q } },
                { username: { contains: q } },
                { profitCode: { contains: q } },
              ],
            }
          : {}),
        ...(profitCode ? { profitCode } : {}),
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        profitCode: true,
        active: true,
        mustChangePassword: true,
        lastLoginAt: true,
        userRoles: {
          where: { active: true },
          select: {
            company: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true, code: true } },
            role: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: { displayName: 'asc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }

  // =====================================================================
  // 10G/10H — Administración de usuarios (solo ADMIN.MANAGE en controller).
  // Data-Maestra es fuente de configuración local; Profit solo identidad.
  // Nunca se expone passwordHash. Toda acción relevante se audita.
  // =====================================================================

  private safeUserSelect() {
    return {
      id: true,
      username: true,
      displayName: true,
      email: true,
      profitCode: true,
      active: true,
      mustChangePassword: true,
      lastLoginAt: true,
      passwordChangedAt: true,
    };
  }

  private async requireTarget(targetId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: this.safeUserSelect(),
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return user;
  }

  private async resolveDetail(targetId: string): Promise<{ roleCodes: string[]; detail: EffectivePermissionDetail[] }> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId: targetId, active: true },
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
      where: { userId: targetId },
      include: { permission: { select: { code: true } } },
    });
    const roleCodes = Array.from(new Set(rows.map(r => r.role.code)));
    const inherited = rows.flatMap(r => (r.role.rolePermissions ?? []).map(rp => rp.permission.code));
    const { detail } = resolveEffectivePermissions(
      inherited,
      overrides.map(o => ({ code: o.permission.code, effect: o.effect })),
    );
    return { roleCodes, detail };
  }

  /** Detalle completo para /admin (sin passwordHash). */
  async getDetalle(targetId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: {
        ...this.safeUserSelect(),
        userRoles: {
          where: { active: true },
          select: {
            id: true,
            company: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true, code: true } },
            role: { select: { code: true, name: true } },
          },
        },
        permissionOverrides: {
          select: { effect: true, permission: { select: { code: true } } },
        },
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    const { roleCodes, detail } = await this.resolveDetail(targetId);
    const catalog = await this.prisma.permission.findMany({
      orderBy: { code: 'asc' },
      select: { code: true },
    });
    return {
      ...user,
      roleCodes,
      effectivePermissions: detail,
      permissionCatalog: catalog.map(p => p.code),
    };
  }

  /** Activa/desactiva. No elimina; conserva roles/org/permisos. Audita. */
  async setActive(targetId: string, active: boolean, actorId: string, actorCompanyId?: string) {
    const before = await this.requireTarget(targetId);
    if (!active && targetId === actorId) {
      throw new ForbiddenException('No puedes desactivar tu propio usuario.');
    }
    const after = await this.prisma.user.update({
      where: { id: targetId },
      data: { active },
      select: this.safeUserSelect(),
    });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      actorCompanyId,
      entityType: 'User',
      entityId: targetId,
      action: active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      beforeData: JSON.stringify({ active: before.active }),
      afterData: JSON.stringify({ active: after.active }),
    });
    return after;
  }

  private async validateOrg(companyId: string, departmentId?: string | null) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada.');
    if (departmentId) {
      const dept = await this.prisma.department.findUnique({ where: { id: departmentId } });
      if (!dept) throw new NotFoundException('Departamento no encontrado.');
      if (dept.companyId !== companyId) {
        throw new BadRequestException('El departamento no pertenece a la empresa indicada.');
      }
    }
  }

  /** Asigna rol con empresa/departamento (crea membresía activa). Audita. */
  async assignRole(targetId: string, dto: { roleCode: string; companyId: string; departmentId?: string | null }, actorId: string, actorCompanyId?: string) {
    await this.requireTarget(targetId);
    const role = await this.prisma.role.findUnique({ where: { code: dto.roleCode } });
    if (!role) throw new NotFoundException('Rol no encontrado.');
    await this.validateOrg(dto.companyId, dto.departmentId);
    const deptId = dto.departmentId ?? null;
    const existing = await this.prisma.userRole.findFirst({
      where: { userId: targetId, roleId: role.id, companyId: dto.companyId, departmentId: deptId, active: true },
    });
    const hadCompany = await this.prisma.userRole.findFirst({
      where: { userId: targetId, companyId: dto.companyId, active: true },
    });
    if (!existing) {
      await this.prisma.userRole.create({
        data: { userId: targetId, roleId: role.id, companyId: dto.companyId, departmentId: deptId, active: true },
      });
    }
    const correlationId = randomUUID();
    await this.auditoria.logEvent({
      correlationId,
      actorId,
      actorCompanyId,
      entityType: 'User',
      entityId: targetId,
      action: 'USER_ROLE_ASSIGNED',
      afterData: JSON.stringify({ roleCode: role.code, companyId: dto.companyId, departmentId: deptId }),
    });
    if (!hadCompany) {
      await this.auditoria.logEvent({
        correlationId,
        actorId,
        actorCompanyId,
        entityType: 'User',
        entityId: targetId,
        action: 'USER_ORG_CHANGED',
        afterData: JSON.stringify({ companyId: dto.companyId, departmentId: deptId }),
      });
    }
    return { ok: true };
  }

  /** Quita rol (desactiva membresía, conserva historia). Audita. */
  async removeRole(targetId: string, dto: { roleCode: string; companyId: string; departmentId?: string | null }, actorId: string, actorCompanyId?: string) {
    await this.requireTarget(targetId);
    const role = await this.prisma.role.findUnique({ where: { code: dto.roleCode } });
    if (!role) throw new NotFoundException('Rol no encontrado.');
    const deptId = dto.departmentId ?? null;
    const existing = await this.prisma.userRole.findFirst({
      where: { userId: targetId, roleId: role.id, companyId: dto.companyId, departmentId: deptId, active: true },
    });
    if (!existing) throw new NotFoundException('Asignación de rol no encontrada.');
    await this.prisma.userRole.update({ where: { id: existing.id }, data: { active: false } });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      actorCompanyId,
      entityType: 'User',
      entityId: targetId,
      action: 'USER_ROLE_REMOVED',
      beforeData: JSON.stringify({ roleCode: role.code, companyId: dto.companyId, departmentId: deptId }),
    });
    return { ok: true };
  }

  /** Override individual (GRANT/DENY). Nadie modifica los propios. Audita. */
  async setOverride(targetId: string, dto: { permissionCode: string; effect: 'GRANT' | 'DENY' }, actorId: string, actorCompanyId?: string) {
    await this.requireTarget(targetId);
    if (targetId === actorId) {
      throw new ForbiddenException('No puedes modificar tus propios permisos individuales.');
    }
    const permission = await this.prisma.permission.findUnique({ where: { code: dto.permissionCode } });
    if (!permission) throw new NotFoundException('Permiso no encontrado.');
    await this.prisma.userPermissionOverride.upsert({
      where: { userId_permissionId: { userId: targetId, permissionId: permission.id } },
      create: { userId: targetId, permissionId: permission.id, effect: dto.effect },
      update: { effect: dto.effect },
    });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      actorCompanyId,
      entityType: 'User',
      entityId: targetId,
      action: dto.effect === 'GRANT' ? 'USER_PERMISSION_GRANTED' : 'USER_PERMISSION_DENIED',
      afterData: JSON.stringify({ permissionCode: permission.code, effect: dto.effect }),
    });
    return { ok: true };
  }

  /** Elimina override (vuelve al estado heredado). Nadie toca los propios. Audita. */
  async removeOverride(targetId: string, permissionCode: string, actorId: string, actorCompanyId?: string) {
    await this.requireTarget(targetId);
    if (targetId === actorId) {
      throw new ForbiddenException('No puedes modificar tus propios permisos individuales.');
    }
    const permission = await this.prisma.permission.findUnique({ where: { code: permissionCode } });
    if (!permission) throw new NotFoundException('Permiso no encontrado.');
    const existing = await this.prisma.userPermissionOverride.findUnique({
      where: { userId_permissionId: { userId: targetId, permissionId: permission.id } },
    });
    if (!existing) throw new NotFoundException('Override no encontrado.');
    await this.prisma.userPermissionOverride.delete({ where: { id: existing.id } });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      actorCompanyId,
      entityType: 'User',
      entityId: targetId,
      action: 'USER_PERMISSION_RESET',
      beforeData: JSON.stringify({ permissionCode: permission.code, effect: existing.effect }),
    });
    return { ok: true };
  }

  /**
   * 10H — Restablece al mecanismo global de contraseña inicial:
   * passwordHash=NULL + mustChangePassword=true + sesiones revocadas.
   * Nunca expone ni registra secretos.
   */
  async resetPassword(targetId: string, actorId: string, actorCompanyId?: string) {
    await this.requireTarget(targetId);
    await this.prisma.user.update({
      where: { id: targetId },
      data: { passwordHash: null, mustChangePassword: true, passwordChangedAt: null },
    });
    await this.prisma.session.updateMany({
      where: { userId: targetId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      actorCompanyId,
      entityType: 'User',
      entityId: targetId,
      action: 'USER_PASSWORD_RESET',
      afterData: JSON.stringify({ mustChangePassword: true }),
    });
    return { ok: true, mustChangePassword: true };
  }

  /**
   * 10J — Asignación masiva de un rol a varios usuarios.
   * Crea únicamente membresías UserRole faltantes dentro de UNA transacción;
   * los ya asignados se reportan sin modificar nada ni auditar.
   * No toca passwordHash, mustChangePassword, active, identidad Profit,
   * organización existente, overrides ni sesiones. Solo ADMIN.MANAGE (controller).
   */
  async assignRoleBulk(
    dto: { userIds: string[]; roleCode: string; companyId: string; departmentId?: string | null },
    actorId: string,
    actorCompanyId?: string,
  ) {
    const userIds = Array.from(new Set((dto.userIds ?? []).filter(id => typeof id === 'string' && id.length > 0)));
    if (userIds.length === 0) throw new BadRequestException('userIds no puede estar vacío.');
    const role = await this.prisma.role.findUnique({ where: { code: dto.roleCode } });
    if (!role) throw new NotFoundException('Rol no encontrado.');
    await this.validateOrg(dto.companyId, dto.departmentId);
    const deptId = dto.departmentId ?? null;
    const correlationId = randomUUID();

    type Row = { userId: string; status: 'ASSIGNED' | 'ALREADY_ASSIGNED' | 'FAILED'; message?: string };
    const results: Row[] = [];
    const toCreate: string[] = [];
    for (const userId of userIds) {
      const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!target) {
        results.push({ userId, status: 'FAILED', message: 'Usuario no encontrado.' });
        continue;
      }
      const existing = await this.prisma.userRole.findFirst({
        where: { userId, roleId: role.id, companyId: dto.companyId, departmentId: deptId, active: true },
      });
      if (existing) {
        results.push({ userId, status: 'ALREADY_ASSIGNED' });
        continue;
      }
      toCreate.push(userId);
    }

    if (toCreate.length > 0) {
      await this.prisma.$transaction(
        toCreate.map(userId =>
          this.prisma.userRole.create({
            data: { userId, roleId: role.id, companyId: dto.companyId, departmentId: deptId, active: true },
          }),
        ),
      );
      for (const userId of toCreate) {
        results.push({ userId, status: 'ASSIGNED' });
        await this.auditoria.logEvent({
          correlationId,
          actorId,
          actorCompanyId,
          entityType: 'User',
          entityId: userId,
          action: 'ROLE_ASSIGNED_BULK',
          afterData: JSON.stringify({
            roleCode: role.code,
            companyId: dto.companyId,
            departmentId: deptId,
            bulk: { total: userIds.length },
          }),
        });
      }
    }

    const assigned = results.filter(r => r.status === 'ASSIGNED').length;
    const alreadyAssigned = results.filter(r => r.status === 'ALREADY_ASSIGNED').length;
    const failed = results.filter(r => r.status === 'FAILED').length;
    return { correlationId, total: userIds.length, assigned, alreadyAssigned, failed, results };
  }
}
