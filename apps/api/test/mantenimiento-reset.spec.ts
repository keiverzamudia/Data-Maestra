import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Reflector } from '@nestjs/core';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MantenimientoService, RESET_CONFIRM_TOKEN } from '../src/modulos/mantenimiento/mantenimiento.service';
import { MantenimientoController } from '../src/modulos/mantenimiento/mantenimiento.controller';
import { RbacGuard } from '../src/modulos/autenticacion/rbac.guard';

// 11 pasos del plan de borrado. MODELS = delegados Prisma (camelCase);
// TABLES = nombres devueltos por el servicio (snake_case de la BD).
const MODELS = [
  'workflowHistory', 'workflowTask', 'approval', 'requestArticleDecision',
  'requestArticleLink', 'requestAccountingCode', 'notification', 'requestData',
  'workflowInstance', 'request', 'auditEvent',
] as const;

const TABLES = [
  'workflow_history', 'workflow_task', 'approval', 'request_article_decision',
  'request_article_link', 'request_accounting_code', 'notification', 'request_data',
  'workflow_instance', 'request', 'audit_event',
] as const;

const COUNTS: Record<string, number> = {
  workflowHistory: 4, workflowTask: 3, approval: 2, requestArticleDecision: 1,
  requestArticleLink: 1, requestAccountingCode: 2, notification: 5, requestData: 2,
  workflowInstance: 2, request: 2, auditEvent: 7,
};

function buildPrisma() {
  const prisma: any = {};
  for (const t of MODELS) {
    prisma[t] = {
      count: vi.fn(async () => COUNTS[t]),
      deleteMany: vi.fn(async () => ({ count: COUNTS[t] })),
    };
  }
  // Tablas que NUNCA deben tocarse: presentes con espías.
  for (const t of ['company', 'department', 'user', 'role', 'permission', 'userRole', 'rolePermission',
    'catalogGroup', 'catalogSubgroup', 'catalogCategory', 'brand', 'unitOfMeasure',
    'catalogVisibilityMode', 'catalogVisibilityItem', 'profitCompanyConfig',
    'masterItem', 'articleNormalizationProfile', 'articleMatchDecision',
    'historicalMatchRelation', 'historicalMatchGroup', 'historicalMatchGroupMember',
    'importRun', 'sourceItem']) {
    prisma[t] = { count: vi.fn(), deleteMany: vi.fn() };
  }
  prisma.$transaction = vi.fn(async (ops: any[]) => {
    const out = [];
    for (const op of ops) out.push(await op);
    return out;
  });
  return prisma;
}

function buildConfig(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = { ALLOW_TEST_RESET: 'true', NODE_ENV: 'development', ...overrides };
  return { get: (k: string, fallback?: string) => values[k] ?? fallback };
}

describe('MantenimientoService (modo pruebas)', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let auditoria: { logEvent: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = buildPrisma();
    auditoria = { logEvent: vi.fn(async () => ({})) };
  });

  const service = () => new MantenimientoService(prisma as any, buildConfig() as any, auditoria as any);

  it('preview cuenta sin borrar', async () => {
    const p = await service().preview();
    expect(p.total).toBe(Object.values(COUNTS).reduce((a, n) => a + n, 0));
    expect(p.tables.map((t) => t.table)).toEqual([...TABLES]);
    for (const t of MODELS) expect(prisma[t].deleteMany).not.toHaveBeenCalled();
  });

  it('reset borra en orden y audita después', async () => {
    const order: string[] = [];
    for (const t of MODELS) {
      prisma[t].deleteMany.mockImplementationOnce(async () => { order.push(t); return { count: COUNTS[t] }; });
    }
    const r = await service().resetTestData(RESET_CONFIRM_TOKEN, 'admin-1', 'c1');
    // Una sola transacción con los 11 borrados en orden.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(order).toEqual([...MODELS]);
    expect(r.total).toBe(Object.values(COUNTS).reduce((a, n) => a + n, 0));
    expect(r.deleted.request).toBe(2);
    expect(r.actorId).toBe('admin-1');
    // Auditoría posterior al borrado (queda como primer evento).
    expect(auditoria.logEvent).toHaveBeenCalledTimes(1);
    expect(auditoria.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'TEST_DATA_RESET_EXECUTED',
      entityType: 'TestDataReset',
      actorId: 'admin-1',
      actorCompanyId: 'c1',
    }));
  });

  it('nunca toca el set conservado', async () => {
    const kept = ['company', 'user', 'role', 'catalogGroup', 'brand',
      'catalogVisibilityItem', 'profitCompanyConfig', 'masterItem',
      'articleNormalizationProfile', 'historicalMatchGroup', 'importRun', 'sourceItem'];
    await service().resetTestData(RESET_CONFIRM_TOKEN, 'admin-1');
    for (const t of kept) {
      expect(prisma[t].deleteMany).not.toHaveBeenCalled();
      expect(prisma[t].count).not.toHaveBeenCalled();
    }
  });

  it('rechaza sin flag', async () => {
    const s = new MantenimientoService(
      prisma as any, buildConfig({ ALLOW_TEST_RESET: 'false' }) as any, auditoria as any,
    );
    await expect(s.preview()).rejects.toThrow(ForbiddenException);
    await expect(s.resetTestData(RESET_CONFIRM_TOKEN, 'admin-1')).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza en producción aunque el flag esté activo', async () => {
    const s = new MantenimientoService(
      prisma as any, buildConfig({ NODE_ENV: 'production' }) as any, auditoria as any,
    );
    await expect(s.resetTestData(RESET_CONFIRM_TOKEN, 'admin-1')).rejects.toThrow(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechaza confirmación incorrecta o vacía (acepta con espacios)', async () => {
    const s = service();
    await expect(s.resetTestData('borrar todo', 'admin-1')).rejects.toThrow(BadRequestException);
    await expect(s.resetTestData('', 'admin-1')).rejects.toThrow(BadRequestException);
    await expect(s.resetTestData(' BORRAR TODO ', 'admin-1')).resolves.toBeDefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('MantenimientoController RBAC', () => {
  it('preview y reset exigen ADMIN.MANAGE', () => {
    const guard = new RbacGuard(new Reflector());
    for (const handler of ['preview', 'reset']) {
      const ctx: any = {
        switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', permissions: ['REQUEST.VIEW'] } }) }),
        getHandler: () => (MantenimientoController.prototype as any)[handler],
        getClass: () => MantenimientoController,
      };
      expect(() => guard.canActivate(ctx)).toThrow(/ADMIN.MANAGE/);
    }
  });

  it('permite con ADMIN.MANAGE', () => {
    const guard = new RbacGuard(new Reflector());
    const ctx: any = {
      switchToHttp: () => ({ getRequest: () => ({ user: { id: 'u1', permissions: ['ADMIN.MANAGE'] } }) }),
      getHandler: () => MantenimientoController.prototype['reset'],
      getClass: () => MantenimientoController,
    };
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
