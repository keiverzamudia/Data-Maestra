import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { ContabilidadService } from '../src/modulos/contabilidad/contabilidad.service';
import { SolicitudesController } from '../src/modulos/solicitudes/solicitud.controller';
import { REQUIRE_PERMISSION_KEY } from '../src/modulos/autenticacion/require-permission.decorator';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';
import {
  WORKFLOW_STATES,
  getNextWorkflowState,
  isTerminalWorkflowState,
} from '../src/modulos/solicitudes/workflow-states';

/**
 * FASE 16A — Contabilidad es la última aprobación humana.
 * Sin Validación Maestra, sin Aprobación Final, sin FINAL_REVIEWER operativo.
 */

function accountingPrisma() {
  return {
    request: { findUnique: vi.fn() },
    requestAccountingCode: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    catalogGroup: { findUnique: vi.fn().mockResolvedValue({ id: 'g1', code: 'FER' }) },
  };
}

describe('16A — Contabilidad aprueba/devuelve/rechaza sin etapas posteriores', () => {
  let service: ContabilidadService;
  let prisma: ReturnType<typeof accountingPrisma>;
  let requests: { approve: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = accountingPrisma();
    requests = { approve: vi.fn() };
    const profit = { getGroupAccountingStandard: vi.fn(async () => ({ configured: true })) };
    service = new ContabilidadService(prisma as any, requests as any, profit as any);
  });

  it('1-2. aprueba PENDIENTE_CONTABILIDAD → CONTABILIDAD_APROBADA', async () => {
    prisma.request.findUnique.mockResolvedValue({
      id: 'req-1', status: 'PENDIENTE_CONTABILIDAD',
      requestData: { groupId: 'g1' }, accountingCodes: [],
    });
    requests.approve.mockResolvedValue({ id: 'req-1', status: 'CONTABILIDAD_APROBADA' });
    const r = await service.approve('req-1', [{ code: '1', description: 'Inv' }], 'u4', 'c1');
    expect(requests.approve).toHaveBeenCalledWith(
      'req-1', { action: 'APPROVE', comment: 'Accounting approved' }, 'u4', 'c1',
    );
    expect(r.status).toBe('CONTABILIDAD_APROBADA');
  });

  it('4. devuelve a Almacén con motivo (RETURN → PENDIENTE_ALMACEN)', async () => {
    prisma.request.findUnique.mockResolvedValue({
      id: 'req-1', status: 'PENDIENTE_CONTABILIDAD',
      requestData: { groupId: 'g1' }, accountingCodes: [],
    });
    requests.approve.mockResolvedValue({ id: 'req-1', status: 'PENDIENTE_ALMACEN' });
    await service.reject('req-1', 'Corregir grupo', 'u4', 'c1');
    expect(requests.approve).toHaveBeenCalledWith(
      'req-1', { action: 'RETURN', comment: 'Corregir grupo' }, 'u4', 'c1',
    );
    expect(getNextWorkflowState('PENDIENTE_CONTABILIDAD', 'RETURN')).toBe('PENDIENTE_ALMACEN');
  });

  it('5/8. rechazar exige motivo; REJECT → RECHAZADO', async () => {
    prisma.request.findUnique.mockResolvedValue({
      id: 'req-1', status: 'PENDIENTE_CONTABILIDAD',
      requestData: { groupId: 'g1' }, accountingCodes: [],
    });
    await expect(service.reject('req-1', '  ', 'u4', 'c1')).rejects.toThrow(BadRequestException);
    expect(getNextWorkflowState('PENDIENTE_CONTABILIDAD', 'REJECT')).toBe('RECHAZADO');
  });
});

describe('16A — Validación Maestra y Aprobación Final ya no son transiciones', () => {
  it('6-7. sin APPROVE/RETURN/REJECT hacia/desde etapas eliminadas', () => {
    expect(() => getNextWorkflowState('PENDIENTE_CONTABILIDAD', 'APPROVE')).not.toThrow();
    expect(getNextWorkflowState('PENDIENTE_CONTABILIDAD', 'APPROVE')).toBe('CONTABILIDAD_APROBADA');
    expect(() => getNextWorkflowState('PENDIENTE_VALIDACION_MAESTRA', 'APPROVE')).toThrow();
    expect(() => getNextWorkflowState('PENDIENTE_VALIDACION_MAESTRA', 'RETURN')).toThrow();
    expect(() => getNextWorkflowState('APROBADO_FINAL', 'APPROVE')).toThrow();
    expect(WORKFLOW_STATES).not.toContain('PENDIENTE_VALIDACION_MAESTRA');
    expect(WORKFLOW_STATES).not.toContain('APROBADO_FINAL');
    expect(WORKFLOW_STATES).not.toContain('REGISTRADO_PROFIT');
    expect(isTerminalWorkflowState('INSERTADO_PROFIT')).toBe(true);
  });

  it('8. FINAL_REVIEWER fuera del RBAC operativo (seed + backfill)', () => {
    const root = join(__dirname, '..', 'prisma');
    const seed = readFileSync(join(root, 'seed.js'), 'utf8');
    const backfill = readFileSync(join(root, 'backfill-role-permissions-10f.js'), 'utf8');
    for (const content of [seed, backfill]) {
      expect(content).not.toContain('FINAL_REVIEWER');
      expect(content).not.toContain('FINAL_REVIEW.APPROVE');
    }
    expect(seed).toContain('WAREHOUSE_MANAGER');
    expect(seed).toContain('ACCOUNTING');
  });
});

describe('16A — gates de Registro Profit', () => {
  function profitService(status: string, engine: any) {
    const db: any = {
      request: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'req-1', requestNumber: 'REQ-0056', status,
          requestedDescription: 'X',
          requestData: {
            groupId: 'g1', subgroupId: 's1', articleType: 'C', taxType: '1',
            unitCode: 'UND', brandCode: '01', masterCode: 'FERMIS-00001',
          },
        }),
        update: vi.fn().mockImplementation(async (a: any) => a.data),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      catalogGroup: { findUnique: vi.fn().mockResolvedValue({ id: 'g1', code: 'FER' }) },
      catalogSubgroup: { findUnique: vi.fn().mockResolvedValue({ id: 's1', code: 'MIS' }) },
      catalogCategory: { findUnique: vi.fn().mockResolvedValue(null) },
      requestData: { update: vi.fn().mockResolvedValue({}) },
      requestArticleLink: { findUnique: vi.fn().mockResolvedValue(null) },
      auditEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const svc = new SolicitudesService(db, {} as any, {} as any, {} as any, {} as any, engine);
    return { svc, db };
  }

  const okEngine = () => ({
    assertAvailable: vi.fn(),
    allocateAndInsert: vi.fn().mockResolvedValue({
      ok: true, coArt: 'FERMIS0001', attempts: [], reconcile: 'CREATED_AND_VERIFIED', differences: [],
    }),
  });

  it('9/14. bloqueado antes de CONTABILIDAD_APROBADA (sin tocar el motor)', async () => {
    const { svc, db } = profitService('PENDIENTE_CONTABILIDAD', okEngine());
    await expect(svc.createInProfit('req-1', 'u4', 'c1')).rejects.toThrow(/CONTABILIDAD_APROBADA/);
    expect(db.request.updateMany).not.toHaveBeenCalled();
  });

  it('10/12/15. habilitado después: INSERT + estado INSERTADO_PROFIT', async () => {
    const { svc, db } = profitService('CONTABILIDAD_APROBADA', okEngine());
    const r = await svc.createInProfit('req-1', 'u4', 'c1');
    expect(r.ok).toBe(true);
    const statuses = [
      ...db.request.updateMany.mock.calls.map((c: any) => c[0].data.status),
      ...db.request.update.mock.calls.map((c: any) => c[0].data.status),
    ];
    expect(statuses).toEqual(['PROCESANDO_PROFIT', 'INSERTADO_PROFIT']);
  });

  it('11. profit-create exige PROFIT.WRITE a nivel controlador', () => {
    const perms: string[] = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, SolicitudesController.prototype['profitCreate']) ?? [];
    expect(perms).toEqual(['PROFIT.WRITE']);
    const retry: string[] = Reflect.getMetadata(REQUIRE_PERMISSION_KEY, SolicitudesController.prototype['profitRetry']) ?? [];
    expect(retry).toEqual(['PROFIT.WRITE']);
  });

  it('13. otro rol no se salta Contabilidad (gate por estado)', async () => {
    for (const status of ['BORRADOR', 'PENDIENTE_GERENTE', 'PENDIENTE_ALMACEN', 'ALMACEN_APROBADO', 'ERROR_PROFIT']) {
      const { svc } = profitService(status, okEngine());
      await expect(svc.createInProfit('req-1', 'uX', 'c1')).rejects.toThrow(BadRequestException);
    }
  });
});
