import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';
import { AlmacenService } from '../src/modulos/almacen/almacen.service';

/**
 * Borrador de Almacén: GUARDAR = progreso, FINALIZAR = ALMACEN_APROBADO.
 * - classify() persiste parcial sin cambiar estado, sin notificar, sin workflow.
 * - Solo approve() (con completitud verificada) mueve PENDIENTE_ALMACEN → ALMACEN_APROBADO.
 */

function makeStore() {
  return {
    request: {
      id: 'req-1', status: 'PENDIENTE_ALMACEN', requestNumber: 'REQ-0007',
      companyId: 'c1', departmentId: 'd1',
    },
    requestData: null as any,
  };
}

function makeService(store: ReturnType<typeof makeStore>) {
  const notifyRequestStep = vi.fn(async () => []);
  const emitMany = vi.fn();
  const approvalCreate = vi.fn(async () => ({}));
  const requestUpdate = vi.fn(async () => ({}));
  const tx = {
    requestData: {
      findUnique: vi.fn(async () => store.requestData),
      create: vi.fn(async (a: any) => {
        store.requestData = { id: 'rd-1', ...a.data };
        return store.requestData;
      }),
      update: vi.fn(async (a: any) => {
        // Réplica fiel de Prisma: undefined no pisa valores guardados.
        const patch: any = {};
        for (const [k, v] of Object.entries(a.data)) if (v !== undefined) patch[k] = v;
        store.requestData = { ...store.requestData, ...patch };
        return store.requestData;
      }),
    },
    catalogGroup: { findUnique: vi.fn(async () => ({ id: 'g1', code: 'RVH' })) },
    catalogSubgroup: { findUnique: vi.fn(async () => ({ id: 'sg1', code: 'CAR' })) },
    masterItem: { findFirst: vi.fn(async () => null) },
    request: { update: requestUpdate },
    auditEvent: { create: vi.fn(async () => ({})) },
    approval: { create: approvalCreate },
  };
  const prisma: any = {
    request: { findUnique: vi.fn(async () => ({ ...store.request })) },
    $transaction: vi.fn(async (fn: any) => fn(tx)),
  };
  const svc = new SolicitudesService(prisma, undefined as any, { notifyRequestStep } as any, { emitMany } as any);
  return { svc, tx, notifyRequestStep, emitMany, approvalCreate, requestUpdate, store };
}

describe('Borrador de Almacén', () => {
  let ctx: ReturnType<typeof makeService>;

  beforeEach(() => {
    ctx = makeService(makeStore());
  });

  it('Test 1: guardar borrador mantiene PENDIENTE_ALMACEN', async () => {
    await ctx.svc.classify('req-1', { groupId: 'g1', subgroupId: 'sg1' }, 'w1', 'c1');
    expect(ctx.requestUpdate).not.toHaveBeenCalled();
    expect(ctx.store.request.status).toBe('PENDIENTE_ALMACEN');
    expect(ctx.store.requestData).toBeDefined();
    expect(ctx.store.requestData.masterCode).toMatch(/^RVHCAR-/);
  });

  it('Test 2: el borrador sigue en la bandeja de Almacén', async () => {
    await ctx.svc.classify('req-1', { groupId: 'g1', subgroupId: 'sg1' }, 'w1', 'c1');
    const prisma: any = {
      request: {
        findMany: vi.fn(async (args: any) =>
          [ctx.store.request].filter((r) => !args.where?.status || r.status === args.where.status),
        ),
        findUnique: vi.fn(async () => ctx.store.request),
      },
    };
    const almacen = new AlmacenService(prisma, ctx.svc);
    const rows = await almacen.findPendingClassification();
    expect(rows.map((r: any) => r.id)).toContain('req-1');
  });

  it('Test 3/4/5: los datos persisten al reabrir y tras recarga (nueva instancia)', async () => {
    await ctx.svc.classify('req-1', { groupId: 'g1', subgroupId: 'sg1', brandId: 'b1' }, 'w1', 'c1');
    // Reapertura y F5: servicio nuevo sobre el mismo store (la API).
    const fresh = makeService(ctx.store);
    const found = await fresh.tx.requestData.findUnique({ where: { requestId: 'req-1' } });
    expect(found.groupId).toBe('g1');
    expect(found.subgroupId).toBe('sg1');
    expect(found.brandId).toBe('b1');
    expect(found.masterCode).toMatch(/^RVHCAR-/);
  });

  it('Test 6: varios guardados conservan la información anterior', async () => {
    await ctx.svc.classify('req-1', { groupId: 'g1', subgroupId: 'sg1' }, 'w1', 'c1');
    await ctx.svc.classify('req-1', { brandId: 'b9', partNumber: 'P-777' }, 'w1', 'c1');
    await ctx.svc.classify('req-1', { application: 'CAMIÓN' }, 'w1', 'c1');
    const rd = ctx.store.requestData;
    expect(rd.groupId).toBe('g1');
    expect(rd.subgroupId).toBe('sg1');
    expect(rd.brandId).toBe('b9');
    expect(rd.partNumber).toBe('P-777');
    expect(rd.application).toBe('CAMIÓN');
    expect(rd.masterCode).toMatch(/^RVHCAR-/);
    expect(ctx.store.request.status).toBe('PENDIENTE_ALMACEN');
  });

  it('Test 7: parcial no borra campos previos (ni siquiera los envía)', async () => {
    await ctx.svc.classify('req-1', { groupId: 'g1', subgroupId: 'sg1', brandId: 'b1' }, 'w1', 'c1');
    const updateMock = ctx.tx.requestData.update;
    updateMock.mockClear();
    await ctx.svc.classify('req-1', { partNumber: 'P-002' }, 'w1', 'c1');
    const sent = updateMock.mock.calls[0][0].data;
    expect(sent).not.toHaveProperty('groupId');
    expect(sent).not.toHaveProperty('subgroupId');
    expect(sent).not.toHaveProperty('brandId');
    expect(sent.partNumber).toBe('P-002');
    expect(ctx.store.requestData.groupId).toBe('g1');
    expect(ctx.store.requestData.brandId).toBe('b1');
  });

  it('Test 7b: borrador sin grupo funciona y genera master al llegar el grupo', async () => {
    await ctx.svc.classify('req-1', { brandId: 'b1', partNumber: 'P-1' }, 'w1', 'c1');
    expect(ctx.store.requestData.brandId).toBe('b1');
    expect(ctx.store.requestData.masterCode).toBeFalsy();
    await ctx.svc.classify('req-1', { groupId: 'g1', subgroupId: 'sg1' }, 'w1', 'c1');
    expect(ctx.store.requestData.masterCode).toMatch(/^RVHCAR-/);
    expect(ctx.store.requestData.brandId).toBe('b1');
  });

  it('Test 8/9: guardar no crea aprobación ni notifica', async () => {
    await ctx.svc.classify('req-1', { groupId: 'g1', subgroupId: 'sg1' }, 'w1', 'c1');
    expect(ctx.approvalCreate).not.toHaveBeenCalled();
    expect(ctx.notifyRequestStep).not.toHaveBeenCalled();
    expect(ctx.emitMany).not.toHaveBeenCalled();
  });

  it('Test 10: solo finalizar mueve PENDIENTE_ALMACEN → ALMACEN_APROBADO', async () => {
    await ctx.svc.classify('req-1', { groupId: 'g1', subgroupId: 'sg1' }, 'w1', 'c1');
    expect(ctx.store.request.status).toBe('PENDIENTE_ALMACEN');
    const prisma: any = {
      request: { findUnique: vi.fn(async () => ({ ...ctx.store.request, requestData: {} })) },
      requestData: {
        findUnique: vi.fn(async () => ({
          ...ctx.store.requestData, articleType: 'C', unitCode: 'UND', taxType: '1',
        })),
      },
    };
    const requests = { approve: vi.fn(async () => ({ id: 'req-1', status: 'ALMACEN_APROBADO' })) };
    const almacen = new AlmacenService(prisma, requests as any);
    const r = await almacen.approve('req-1', 'w1', 'c1');
    expect(requests.approve).toHaveBeenCalledWith(
      'req-1', { action: 'APPROVE', comment: 'Warehouse classification approved' }, 'w1', 'c1',
    );
    expect(r.status).toBe('ALMACEN_APROBADO');
  });

  it('borrador fuera de PENDIENTE_ALMACEN se rechaza', async () => {
    ctx.store.request.status = 'ALMACEN_APROBADO';
    await expect(ctx.svc.classify('req-1', { brandId: 'b1' }, 'w1', 'c1')).rejects.toThrow(BadRequestException);
  });

  it('descripción ajustada se persiste recortada y se audita con anterior', async () => {
    await ctx.svc.classify('req-1', { groupId: 'g1', subgroupId: 'sg1', adjustedDescription: '  TORNILLO HEX 1/2 PULGADA  ' }, 'w1', 'c1');
    expect(ctx.store.requestData.adjustedDescription).toBe('TORNILLO HEX 1/2 PULGADA');
    const audit = ctx.tx.auditEvent.create.mock.calls[0][0].data;
    expect(audit.action).toBe('CLASSIFIED');
    expect(JSON.parse(audit.afterData).adjustedDescription).toBe('TORNILLO HEX 1/2 PULGADA');
    expect(JSON.parse(audit.afterData).adjustedDescriptionPrevious).toBeNull();
  });

  it('descripción ajustada vacía limpia el ajuste previo (NULL)', async () => {
    await ctx.svc.classify('req-1', { groupId: 'g1', subgroupId: 'sg1', adjustedDescription: 'TORNILLO CORTO' }, 'w1', 'c1');
    expect(ctx.store.requestData.adjustedDescription).toBe('TORNILLO CORTO');
    await ctx.svc.classify('req-1', { adjustedDescription: '   ' }, 'w1', 'c1');
    expect(ctx.store.requestData.adjustedDescription).toBeNull();
    const audit = ctx.tx.auditEvent.create.mock.calls[1][0].data;
    expect(JSON.parse(audit.afterData).adjustedDescription).toBeNull();
    expect(JSON.parse(audit.afterData).adjustedDescriptionPrevious).toBe('TORNILLO CORTO');
  });
});
