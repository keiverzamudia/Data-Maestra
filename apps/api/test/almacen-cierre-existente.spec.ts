import { describe, it, expect, vi } from 'vitest';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';
import { AlmacenService } from '../src/modulos/almacen/almacen.service';

/**
 * 23.3 — Cierre SAME (A1): la solicitud resuelta con "Es este" termina en
 * INSERTADO_PROFIT reutilizando el código vinculado, sin crear nada nuevo en
 * Profit. Cobertura: transición atómica, profitCode, workflow, auditoría
 * CLOSE_REUSED_EXISTING, notificación al solicitante (C1) y guards.
 */

const SAME_LINK = {
  decision: 'SAME',
  profitArticleCode: 'RMEMAQ0900',
  companyCode: 'AD_TRANS',
  decidedBy: 'u-alm',
};

function buildSolicitudes(
  opts: {
    status?: string;
    articleLink?: unknown;
    requestData?: unknown;
    workflowInstance?: unknown;
    claimCount?: number;
  } = {},
) {
  const request = {
    id: 'req-1',
    requestNumber: 'REQ-0068',
    status: opts.status ?? 'PENDIENTE_ALMACEN',
    companyId: 'c1',
    departmentId: 'd1',
    requesterId: 'u-req',
    articleLink: opts.articleLink === undefined ? null : opts.articleLink,
    requestData: opts.requestData === undefined
      ? { requestId: 'req-1', profitCode: null }
      : opts.requestData,
    workflowInstance: opts.workflowInstance === undefined
      ? { id: 'wf-1' }
      : opts.workflowInstance,
  };

  const tx: any = {
    request: { updateMany: vi.fn(async () => ({ count: opts.claimCount ?? 1 })) },
    requestData: { upsert: vi.fn(async () => ({})) },
    workflowHistory: { create: vi.fn(async () => ({})) },
    workflowTask: { updateMany: vi.fn(async () => ({ count: 1 })) },
    workflowInstance: { update: vi.fn(async () => ({})) },
    approval: { create: vi.fn(async () => ({})) },
    auditEvent: { create: vi.fn(async () => ({})) },
  };

  const prisma: any = {
    request: { findUnique: vi.fn(async () => request) },
    $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };

  const notificaciones: any = {
    notifyRequestStep: vi.fn(async () => [{
      id: 'n1', userId: 'u-req', requestId: 'req-1', type: 'INSERTADO_PROFIT',
      title: 't', body: 'b', link: null, createdAt: new Date(),
    }]),
  };
  const sse: any = { emitMany: vi.fn() };

  const service = new SolicitudesService(
    prisma, {} as any, notificaciones, sse, {} as any,
  );
  return { service, prisma, tx, notificaciones, sse };
}

describe('23.3 Cierre SAME — resolveWithExistingArticle (A1)', () => {
  it('cierra PENDIENTE_ALMACEN → INSERTADO_PROFIT con el código vinculado', async () => {
    const { service, tx, notificaciones, sse } = buildSolicitudes({ articleLink: SAME_LINK });

    const result = await service.resolveWithExistingArticle('req-1', 'u-alm', 'c1');

    expect(result.status).toBe('INSERTADO_PROFIT');
    expect(result.profitCode).toBe('RMEMAQ0900');
    expect(result.notified).toBe(1);
    // Reclamo atómico sobre el estado previo (solo un cierre gana).
    expect(tx.request.updateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'PENDIENTE_ALMACEN' },
      data: { status: 'INSERTADO_PROFIT' },
    });
    expect(tx.requestData.upsert).toHaveBeenCalledWith({
      where: { requestId: 'req-1' },
      create: { requestId: 'req-1', profitCode: 'RMEMAQ0900' },
      update: { profitCode: 'RMEMAQ0900' },
    });
    // Workflow: historial del salto, tarea actual completada e instancia avanzada.
    expect(tx.workflowHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        fromStep: 'PENDIENTE_ALMACEN',
        toStep: 'INSERTADO_PROFIT',
        action: 'APPROVE',
        actorId: 'u-alm',
      }),
    }));
    expect(tx.workflowTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
    }));
    expect(tx.workflowInstance.update).toHaveBeenCalledWith({
      where: { id: 'wf-1' },
      data: { currentStepCode: 'INSERTADO_PROFIT' },
    });
    // Auditoría con diff before/after.
    expect(tx.approval.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        requestId: 'req-1',
        action: 'APPROVE',
        fromStatus: 'PENDIENTE_ALMACEN',
        toStatus: 'INSERTADO_PROFIT',
      }),
    }));
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'CLOSE_REUSED_EXISTING',
        entityType: 'Request',
        entityId: 'req-1',
        actorId: 'u-alm',
        actorCompanyId: 'c1',
        afterData: expect.stringContaining('RMEMAQ0900'),
      }),
    }));
    // C1 — notificación al solicitante con el código reutilizado + SSE.
    expect(notificaciones.notifyRequestStep).toHaveBeenCalledWith(tx, expect.objectContaining({
      requestId: 'req-1',
      stepCode: 'INSERTADO_PROFIT',
      extraUserIds: ['u-req'],
      body: expect.stringContaining('RMEMAQ0900'),
    }));
    expect(sse.emitMany).toHaveBeenCalledWith([expect.objectContaining({ userId: 'u-req' })]);
  });

  it('sin vínculo SAME no transiciona ni notifica', async () => {
    const { service, prisma } = buildSolicitudes({ articleLink: null });
    await expect(
      service.resolveWithExistingArticle('req-1', 'u-alm', 'c1'),
    ).rejects.toThrow('confirmado (SAME)');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('vínculo DIFFERENT no cierra (sigue el flujo normal de creación)', async () => {
    const { service, prisma } = buildSolicitudes({
      articleLink: { ...SAME_LINK, decision: 'DIFFERENT' },
    });
    await expect(
      service.resolveWithExistingArticle('req-1', 'u-alm', 'c1'),
    ).rejects.toThrow('confirmado (SAME)');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('estado distinto de PENDIENTE_ALMACEN se rechaza con Conflict', async () => {
    const { service, prisma } = buildSolicitudes({
      status: 'ALMACEN_APROBADO',
      articleLink: SAME_LINK,
    });
    await expect(
      service.resolveWithExistingArticle('req-1', 'u-alm', 'c1'),
    ).rejects.toThrow('ya no está en revisión');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requestData inexistente (sin borrador) no bloquea: la fila se crea con el código', async () => {
    const { service, tx } = buildSolicitudes({
      articleLink: SAME_LINK,
      requestData: null,
    });
    const result = await service.resolveWithExistingArticle('req-1', 'u-alm', 'c1');
    expect(result.status).toBe('INSERTADO_PROFIT');
    expect(tx.requestData.upsert).toHaveBeenCalledWith({
      where: { requestId: 'req-1' },
      create: { requestId: 'req-1', profitCode: 'RMEMAQ0900' },
      update: { profitCode: 'RMEMAQ0900' },
    });
    // Auditoría honesta: beforeData refleja que no había código previo.
    expect(tx.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        beforeData: expect.stringContaining('"profitCode":null'),
      }),
    }));
  });

  it('cierre concurrente pierde el reclamo y aborta la transacción', async () => {
    const { service, tx } = buildSolicitudes({
      articleLink: SAME_LINK,
      claimCount: 0,
    });
    await expect(
      service.resolveWithExistingArticle('req-1', 'u-alm', 'c1'),
    ).rejects.toThrow('CLOSE_IN_PROGRESS');
    expect(tx.requestData.upsert).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(tx.approval.create).not.toHaveBeenCalled();
  });

  it('solicitud sin workflowInstance cierra igual (sin tocar workflow)', async () => {
    const { service, tx } = buildSolicitudes({
      articleLink: SAME_LINK,
      workflowInstance: null,
    });
    const result = await service.resolveWithExistingArticle('req-1', 'u-alm', 'c1');
    expect(result.status).toBe('INSERTADO_PROFIT');
    expect(tx.workflowHistory.create).not.toHaveBeenCalled();
    expect(tx.workflowTask.updateMany).not.toHaveBeenCalled();
    expect(tx.workflowInstance.update).not.toHaveBeenCalled();
    // Auditoría y aprobación igualmente registradas.
    expect(tx.auditEvent.create).toHaveBeenCalled();
    expect(tx.approval.create).toHaveBeenCalled();
  });
});

describe('23.3 Cierre SAME — AlmacenService (puerta de entrada)', () => {
  function buildAlmacen(status = 'PENDIENTE_ALMACEN') {
    const prisma: any = {
      request: {
        findUnique: vi.fn(async () => ({
          id: 'req-1',
          status,
          requestData: null,
          articleLink: SAME_LINK,
        })),
      },
    };
    const requestsService: any = {
      resolveWithExistingArticle: vi.fn(async () => ({
        id: 'req-1', status: 'INSERTADO_PROFIT', profitCode: 'RMEMAQ0900', notified: 1,
      })),
    };
    const service = new AlmacenService(prisma, requestsService);
    return { service, requestsService };
  }

  it('closeWithExisting delega en resolveWithExistingArticle', async () => {
    const { service, requestsService } = buildAlmacen();
    const result = await service.closeWithExisting('req-1', 'u-alm', 'c1');
    expect(requestsService.resolveWithExistingArticle)
      .toHaveBeenCalledWith('req-1', 'u-alm', 'c1');
    expect(result.status).toBe('INSERTADO_PROFIT');
  });

  it('rechaza si la solicitud ya no está en PENDIENTE_ALMACEN', async () => {
    const { service, requestsService } = buildAlmacen('ALMACEN_APROBADO');
    await expect(
      service.closeWithExisting('req-1', 'u-alm', 'c1'),
    ).rejects.toThrow('not pending warehouse');
    expect(requestsService.resolveWithExistingArticle).not.toHaveBeenCalled();
  });

  it('rechaza si la solicitud no existe', async () => {
    const prisma: any = { request: { findUnique: vi.fn(async () => null) } };
    const requestsService: any = { resolveWithExistingArticle: vi.fn() };
    const service = new AlmacenService(prisma, requestsService);
    await expect(
      service.closeWithExisting('no-existe', 'u-alm', 'c1'),
    ).rejects.toThrow('not found');
    expect(requestsService.resolveWithExistingArticle).not.toHaveBeenCalled();
  });
});
