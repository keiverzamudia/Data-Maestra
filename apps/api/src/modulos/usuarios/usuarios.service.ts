import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../comun/prisma/prisma.service';
import { ProfitAdapterService, ProfitUser } from '../profit/profit-adapter.service';
import { AuditoriaService } from '../auditoria/auditoria.service';

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
   * Búsqueda local para preparar el login de 10D. Nunca expone passwordHash.
   */
  async searchLocal(search?: string, profitCode?: string, limit = 20) {
    return this.prisma.user.findMany({
      where: {
        ...(search ? { displayName: { contains: search } } : {}),
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
      },
      orderBy: { displayName: 'asc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }
}
