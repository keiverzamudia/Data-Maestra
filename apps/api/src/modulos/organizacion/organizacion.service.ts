import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

@Injectable()
export class OrganizacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async findCompanies() {
    const companies = await this.prisma.company.findMany({
      orderBy: { name: 'asc' },
    });
    const [userLinks, departments] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { active: true },
        select: { userId: true, companyId: true },
      }),
      this.prisma.department.groupBy({ by: ['companyId'], _count: { id: true } }),
    ]);
    const usersByCompany = new Map<string, Set<string>>();
    for (const l of userLinks) {
      if (!usersByCompany.has(l.companyId)) usersByCompany.set(l.companyId, new Set());
      usersByCompany.get(l.companyId)!.add(l.userId);
    }
    const deptCount = new Map(departments.map(d => [d.companyId, d._count.id]));
    // 12I — incluye inactivas (el admin las gestiona); el selector de empresa
    // filtra por active en frontend.
    return companies.map(c => ({
      ...c,
      userCount: usersByCompany.get(c.id)?.size ?? 0,
      departmentCount: deptCount.get(c.id) ?? 0,
    }));
  }

  async findDepartments(companyId?: string) {
    return this.prisma.department.findMany({
      where: {
        active: true,
        ...(companyId ? { companyId } : {}),
      },
      include: { company: { select: { id: true, name: true, code: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findUsers(companyId?: string) {
    return this.prisma.user.findMany({
      where: { active: true },
      include: {
        userRoles: {
          where: companyId ? { companyId } : undefined,
          include: {
            role: { select: { id: true, code: true, name: true } },
            company: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { displayName: 'asc' },
    });
  }

  async findRoles() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
    });
  }

  /** 12I — Crea empresa. El código es identidad (único); audita. */
  async createCompany(
    dto: { name: string; code: string; active?: boolean },
    actorId: string,
  ) {
    const name = dto.name.trim();
    const code = dto.code.trim().toUpperCase();
    if (name.length < 2 || code.length < 2) {
      throw new BadRequestException('Nombre y código requieren mínimo 2 caracteres.');
    }
    const dupe = await this.prisma.company.findUnique({ where: { code } });
    if (dupe) throw new ConflictException(`Ya existe una empresa con el código ${code}.`);
    const created = await this.prisma.company.create({
      data: { name, code, active: dto.active ?? true },
    });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      entityType: 'Company',
      entityId: created.id,
      action: 'COMPANY_CREATED',
      afterData: JSON.stringify({ name, code, active: created.active }),
    });
    return created;
  }

  /**
   * 12I — Edita nombre/código/estado. El id jamás cambia; usuarios,
   * departamentos, solicitudes y auditoría siguen apuntando al mismo
   * companyId (concurrencia por referencia, sin updates masivos).
   */
  async updateCompany(
    id: string,
    dto: { name?: string; code?: string; active?: boolean },
    actorId: string,
  ) {
    const before = await this.prisma.company.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Empresa no encontrada.');
    const data: { name?: string; code?: string; active?: boolean } = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name.length < 2 || name.length > 120) {
        throw new BadRequestException('El nombre debe tener entre 2 y 120 caracteres.');
      }
      data.name = name;
    }
    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      if (code.length < 2 || code.length > 20) {
        throw new BadRequestException('El código debe tener entre 2 y 20 caracteres.');
      }
      const dupe = await this.prisma.company.findUnique({ where: { code } });
      if (dupe && dupe.id !== id) throw new ConflictException(`Ya existe una empresa con el código ${code}.`);
      data.code = code;
    }
    if (dto.active !== undefined) data.active = dto.active;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Sin cambios: indica nombre, código y/o estado.');
    }
    const after = await this.prisma.company.update({ where: { id }, data });
    const correlationId = randomUUID();
    await this.auditoria.logEvent({
      correlationId,
      actorId,
      entityType: 'Company',
      entityId: id,
      action: 'COMPANY_UPDATED',
      beforeData: JSON.stringify({ name: before.name, code: before.code, active: before.active }),
      afterData: JSON.stringify({ name: after.name, code: after.code, active: after.active }),
    });
    if (before.active && after.active === false) {
      await this.auditoria.logEvent({
        correlationId,
        actorId,
        entityType: 'Company',
        entityId: id,
        action: 'COMPANY_DEACTIVATED',
        beforeData: JSON.stringify({ active: true }),
        afterData: JSON.stringify({ active: false }),
      });
    }
    return after;
  }

  /**
   * 12I — Elimina físicamente SOLO si no tiene ninguna referencia
   * (membresías, departamentos, solicitudes, auditoría, importaciones,
   * source items). Si no, 409 con el desglose; usar migrar+retirar.
   */
  async deleteCompany(id: string, actorId: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Empresa no encontrada.');
    const [memberships, departments, requests, audit, imports, sourceItems] = await Promise.all([
      this.prisma.userRole.count({ where: { companyId: id } }),
      this.prisma.department.count({ where: { companyId: id } }),
      this.prisma.request.count({ where: { companyId: id } }),
      this.prisma.auditEvent.count({ where: { actorCompanyId: id } }),
      this.prisma.importRun.count({ where: { companyId: id } }),
      this.prisma.sourceItem.count({ where: { companyId: id } }),
    ]);
    const refs = { memberships, departments, requests, audit, imports, sourceItems };
    const total = Object.values(refs).reduce((a, b) => a + b, 0);
    if (total > 0) {
      throw new ConflictException(
        `La empresa tiene referencias históricas y no puede eliminarse. Migre y retire en su lugar.`,
      );
    }
    await this.prisma.company.delete({ where: { id } });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      entityType: 'Company',
      entityId: id,
      action: 'COMPANY_DELETED',
      beforeData: JSON.stringify({ name: company.name, code: company.code }),
    });
    return { ok: true };
  }

  /**
   * 12I — Vista previa de migración: usuarios activos, departamentos afectados
   * (con usuarios cada uno) y solicitudes históricas. Sin cambios.
   */
  async previewMigration(fromCompanyId: string, toCompanyId: string) {
    const [from, to] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: fromCompanyId } }),
      this.prisma.company.findUnique({ where: { id: toCompanyId } }),
    ]);
    if (!from) throw new NotFoundException('Empresa origen no encontrada.');
    if (!to) throw new NotFoundException('Empresa destino no encontrada.');
    const memberships = await this.prisma.userRole.findMany({
      where: { companyId: fromCompanyId, active: true },
      select: { userId: true, departmentId: true },
    });
    const userIds = [...new Set(memberships.map(m => m.userId))];
    const deptIds = [...new Set(memberships.map(m => m.departmentId).filter((d): d is string => !!d))];
    const departments = deptIds.length
      ? await this.prisma.department.findMany({
          where: { id: { in: deptIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const byDept = new Map<string, number>();
    for (const m of memberships) {
      if (m.departmentId) byDept.set(m.departmentId, (byDept.get(m.departmentId) ?? 0) + 1);
    }
    const historicalRequests = await this.prisma.request.count({ where: { companyId: fromCompanyId } });
    return {
      from: { id: from.id, name: from.name, code: from.code },
      to: { id: to.id, name: to.name, code: to.code },
      users: userIds.length,
      departments: departments.map(d => ({ ...d, memberships: byDept.get(d.id) ?? 0 })),
      unmappedNote: 'Cada departamento afectado requiere equivalencia en destino o "Sin departamento".',
      historicalRequests,
    };
  }

  /**
   * 12I — Migra membresías activas origen→destino y retira (desactiva) el origen.
   * Transaccional (todo o nada). Conserva identidad, roles, permisos, historial:
   * solo cambia companyId (+ departmentId según mapa). Solicitudes y auditoría
   * históricas NO se tocan. No toca Profit.
   */
  async migrateCompany(
    dto: { fromCompanyId: string; toCompanyId: string; departmentMap?: Record<string, string | null> },
    actorId: string,
  ) {
    const { fromCompanyId, toCompanyId } = dto;
    if (fromCompanyId === toCompanyId) {
      throw new BadRequestException('La empresa destino debe ser diferente a la origen.');
    }
    const [from, to] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: fromCompanyId } }),
      this.prisma.company.findUnique({ where: { id: toCompanyId } }),
    ]);
    if (!from) throw new NotFoundException('Empresa origen no encontrada.');
    if (!to) throw new NotFoundException('Empresa destino no encontrada.');
    if (!to.active) throw new BadRequestException('La empresa destino está inactiva.');

    const memberships = await this.prisma.userRole.findMany({
      where: { companyId: fromCompanyId, active: true },
      include: { role: { select: { code: true, rolePermissions: { select: { permission: { select: { code: true } } } } } } },
    });
    const deptIds = [...new Set(memberships.map(m => m.departmentId).filter((d): d is string => !!d))];
    const map = dto.departmentMap ?? {};
    const unmapped: string[] = [];
    for (const d of deptIds) {
      if (!(d in map)) {
        const dept = await this.prisma.department.findUnique({ where: { id: d } });
        unmapped.push(dept ? `${dept.name} (${dept.code})` : d);
      }
    }
    if (unmapped.length > 0) {
      throw new BadRequestException(
        `Departamentos sin equivalencia: ${unmapped.join(', ')}. Asigne destino o "Sin departamento".`,
      );
    }
    for (const [, newId] of Object.entries(map)) {
      if (newId === null || newId === undefined) continue;
      const dest = await this.prisma.department.findUnique({ where: { id: newId } });
      if (!dest || dest.companyId !== toCompanyId || !dest.active) {
        throw new BadRequestException('Equivalencia inválida: el departamento destino debe pertenecer a la empresa destino y estar activo.');
      }
    }

    await this.assertActorKeepsAdmin(actorId, fromCompanyId, toCompanyId, memberships);

    const correlationId = randomUUID();
    await this.auditoria.logEvent({
      correlationId,
      actorId,
      entityType: 'Company',
      entityId: fromCompanyId,
      action: 'COMPANY_MIGRATION_STARTED',
      afterData: JSON.stringify({ fromCompanyId, toCompanyId, memberships: memberships.length }),
    });

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        let moved = 0;
        let deduplicated = 0;
        for (const m of memberships) {
          const newDept = m.departmentId ? (map[m.departmentId] ?? null) : null;
          const dupe = await tx.userRole.findFirst({
            where: { userId: m.userId, roleId: m.roleId, companyId: toCompanyId, departmentId: newDept, active: true },
          });
          if (dupe) {
            // Ya existe idéntica en destino: no duplicar, solo se retira la de origen.
            await tx.userRole.update({ where: { id: m.id }, data: { active: false } });
            deduplicated += 1;
            continue;
          }
          await tx.userRole.update({
            where: { id: m.id },
            data: { companyId: toCompanyId, departmentId: newDept },
          });
          moved += 1;
        }
        await tx.company.update({ where: { id: fromCompanyId }, data: { active: false } });
        return { moved, deduplicated };
      });

      const historicalRequests = await this.prisma.request.count({ where: { companyId: fromCompanyId } });
      await this.auditoria.logEvent({
        correlationId,
        actorId,
        entityType: 'Company',
        entityId: fromCompanyId,
        action: 'COMPANY_MIGRATION_COMPLETED',
        afterData: JSON.stringify({
          fromCompanyId,
          toCompanyId,
          users: new Set(memberships.map(m => m.userId)).size,
          membershipsMoved: result.moved,
          membershipsDeduplicated: result.deduplicated,
          departmentsAffected: deptIds.length,
          historicalRequests,
        }),
      });
      return { ok: true, ...result, users: new Set(memberships.map(m => m.userId)).size, departmentsAffected: deptIds.length, historicalRequests };
    } catch (err: any) {
      if (err?.status === 400 || err?.status === 404 || err?.status === 409) throw err;
      await this.auditoria.logEvent({
        correlationId,
        actorId,
        entityType: 'Company',
        entityId: fromCompanyId,
        action: 'COMPANY_MIGRATION_FAILED',
        afterData: JSON.stringify({ fromCompanyId, toCompanyId, error: err?.message ?? 'error' }),
      });
      throw err;
    }
  }

  /**
   * 12I — El actor nunca puede quedarse sin ADMIN.MANAGE por migrar:
   * conserva el permiso por membresías fuera del origen, las que se mueven
   * (si su rol lo otorga) o un override CONCEDIDO.
   */
  private async assertActorKeepsAdmin(
    actorId: string,
    fromCompanyId: string,
    toCompanyId: string,
    moving: { userId: string; role: { code: string; rolePermissions: { permission: { code: string } }[] } }[],
  ) {
    const rolesWithAdmin = (rows: { role: { rolePermissions: { permission: { code: string } }[] } }[]) =>
      rows.some(r => (r.role.rolePermissions ?? []).some(rp => rp.permission.code === 'ADMIN.MANAGE'));
    const [outside, grantOverride] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { userId: actorId, active: true, companyId: { not: fromCompanyId } },
        include: { role: { select: { code: true, rolePermissions: { select: { permission: { select: { code: true } } } } } } },
      }),
      this.prisma.userPermissionOverride.findFirst({
        where: { userId: actorId, effect: 'CONCEDIDO', permission: { code: 'ADMIN.MANAGE' } },
      }),
    ]);
    const movedMine = moving.filter(m => m.userId === actorId);
    const destActive = await this.prisma.company.findUnique({ where: { id: toCompanyId } });
    const keeps =
      !!grantOverride ||
      rolesWithAdmin(outside) ||
      (!!destActive?.active && rolesWithAdmin(movedMine));
    if (!keeps) {
      throw new BadRequestException(
        'No puedes migrar esta empresa: perderías tu acceso administrativo. Pide a otro administrador que ejecute la migración.',
      );
    }
  }
  /** 12I — Crea departamento (código único por empresa). Audita DEPARTMENT_CREATED. */
  async createDepartment(
    dto: { name: string; code: string; companyId: string; managerId?: string | null; active?: boolean },
    actorId: string,
  ) {
    const name = dto.name.trim();
    const code = dto.code.trim().toUpperCase();
    if (name.length < 2 || name.length > 120) {
      throw new BadRequestException('El nombre debe tener entre 2 y 120 caracteres.');
    }
    if (code.length < 2 || code.length > 20) {
      throw new BadRequestException('El código debe tener entre 2 y 20 caracteres.');
    }
    const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
    if (!company) throw new NotFoundException('Empresa no encontrada.');
    if (!company.active) throw new BadRequestException('La empresa está inactiva.');
    const dupe = await this.prisma.department.findUnique({
      where: { companyId_code: { companyId: dto.companyId, code } },
    });
    if (dupe) throw new ConflictException(`Ya existe el departamento ${code} en esta empresa.`);
    let managerId: string | null = null;
    if (dto.managerId !== undefined && dto.managerId !== null) {
      const manager = await this.prisma.user.findUnique({ where: { id: dto.managerId } });
      if (!manager || !manager.active) {
        throw new BadRequestException('El responsable debe ser un usuario activo existente.');
      }
      managerId = dto.managerId;
    }
    const created = await this.prisma.department.create({
      data: { name, code, companyId: dto.companyId, managerId, active: dto.active ?? true },
    });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      entityType: 'Department',
      entityId: created.id,
      action: 'DEPARTMENT_CREATED',
      afterData: JSON.stringify({ name, code, companyId: dto.companyId, managerId, active: created.active }),
    });
    return created;
  }

  /**
   * 11F — Actualiza nombre y/o gerente de un departamento.
   * No permite cambiar empresa, código ni estado: son identidad organizacional
   * referenciada por solicitudes y membresías. Audita con diff.
   */
  async updateDepartment(
    id: string,
    dto: { name?: string; managerId?: string | null; active?: boolean },
    actorId: string,
    actorCompanyId?: string,
  ) {
    const before = await this.prisma.department.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Departamento no encontrado.');

    const data: { name?: string; managerId?: string | null; active?: boolean } = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (name.length < 2 || name.length > 120) {
        throw new BadRequestException('El nombre debe tener entre 2 y 120 caracteres.');
      }
      data.name = name;
    }
    if (dto.managerId !== undefined) {
      if (dto.managerId !== null) {
        const manager = await this.prisma.user.findUnique({ where: { id: dto.managerId } });
        if (!manager || !manager.active) {
          throw new BadRequestException('El gerente debe ser un usuario activo existente.');
        }
      }
      data.managerId = dto.managerId;
    }
    if (dto.active !== undefined) data.active = dto.active;
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Sin cambios: indica nombre, gerente y/o estado.');
    }

    const after = await this.prisma.department.update({ where: { id }, data });
    await this.auditoria.logEvent({
      correlationId: randomUUID(),
      actorId,
      actorCompanyId,
      entityType: 'Department',
      entityId: id,
      action: 'DEPARTMENT_UPDATED',
      beforeData: JSON.stringify({ name: before.name, managerId: before.managerId, active: before.active }),
      afterData: JSON.stringify({ name: after.name, managerId: after.managerId, active: after.active }),
    });
    return after;
  }
}
