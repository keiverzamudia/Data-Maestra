import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AprobacionAlmacenService } from '../src/modulos/aprobacion-almacen/aprobacion-almacen.service';
import { AprobacionAlmacenController } from '../src/modulos/aprobacion-almacen/aprobacion-almacen.controller';
import { REQUIRE_PERMISSION_KEY } from '../src/modulos/autenticacion/require-permission.decorator';
import { SolicitudesService, stepNotificationMessage } from '../src/modulos/solicitudes/solicitud.service';
import { NotificacionesService } from '../src/modulos/notificaciones/notificaciones.service';
import { getNextWorkflowState } from '../src/modulos/solicitudes/workflow-states';

const COMPLETE_DATA = {
  requestId: 'req-1', groupId: 'g1', subgroupId: 'sg1', masterCode: 'RVHCAR-00001',
  articleType: 'C', unitCode: 'UND', taxType: '1',
};

const PENDING_ROW = {
  id: 'req-1', status: 'ALMACEN_APROBADO', companyId: 'c1',
  requestData: { groupId: 'g1' },
};

function prismaMock() {
  return {
    request: { findMany: vi.fn(), findUnique: vi.fn() },
    requestData: { findUnique: vi.fn() },
  };
}

function requestsMock() {
  return { approve: vi.fn() };
}

describe('15A — AprobacionAlmacenService', () => {
  let service: AprobacionAlmacenService;
  let prisma: ReturnType<typeof prismaMock>;
  let requests: ReturnType<typeof requestsMock>;

  beforeEach(() => {
    prisma = prismaMock();
    requests = requestsMock();
    service = new AprobacionAlmacenService(prisma as any, requests as any);
  });

  it('cola propia: solo ALMACEN_APROBADO de la empresa', async () => {
    prisma.request.findMany.mockResolvedValue([PENDING_ROW]);
    const rows = await service.findPendingApproval('c1');
    expect(prisma.request.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ALMACEN_APROBADO', companyId: 'c1' } }),
    );
    expect(rows).toHaveLength(1);
  });

  it('detalle 404 si no está en ALMACEN_APROBADO (doble aprobación controlada)', async () => {
    prisma.request.findUnique.mockResolvedValue({ ...PENDING_ROW, status: 'PENDIENTE_CONTABILIDAD' });
    await expect(service.findOneForApproval('req-1', 'c1')).rejects.toThrow(NotFoundException);
    await expect(service.approve('req-1', 'u-enc', 'c1')).rejects.toThrow(NotFoundException);
    expect(requests.approve).not.toHaveBeenCalled();
  });

  it('detalle 404 si es de otra empresa', async () => {
    prisma.request.findUnique.mockResolvedValue(PENDING_ROW);
    await expect(service.findOneForApproval('req-1', 'c2')).rejects.toThrow(NotFoundException);
  });

  it('aprueba a Contabilidad con la transición existente', async () => {
    prisma.request.findUnique.mockResolvedValue(PENDING_ROW);
    prisma.requestData.findUnique.mockResolvedValue(COMPLETE_DATA);
    requests.approve.mockResolvedValue({ id: 'req-1', status: 'PENDIENTE_CONTABILIDAD' });

    const result = await service.approve('req-1', 'u-enc', 'c1');

    expect(requests.approve).toHaveBeenCalledWith(
      'req-1',
      { action: 'APPROVE', comment: 'Aprobación del Encargado de Almacén' },
      'u-enc',
      'c1',
    );
    expect(result.status).toBe('PENDIENTE_CONTABILIDAD');
  });

  it('bloquea aprobación con clasificación incompleta', async () => {
    prisma.request.findUnique.mockResolvedValue(PENDING_ROW);
    prisma.requestData.findUnique.mockResolvedValue({ ...COMPLETE_DATA, masterCode: null });
    await expect(service.approve('req-1', 'u-enc', 'c1')).rejects.toThrow(BadRequestException);
    expect(requests.approve).not.toHaveBeenCalled();
  });

  it('bloquea aprobación sin datos Profit (tipo/unidad/impuesto)', async () => {
    prisma.request.findUnique.mockResolvedValue(PENDING_ROW);
    prisma.requestData.findUnique.mockResolvedValue({ ...COMPLETE_DATA, unitCode: null });
    await expect(service.approve('req-1', 'u-enc', 'c1')).rejects.toThrow(BadRequestException);
    expect(requests.approve).not.toHaveBeenCalled();
  });

  it('devolver exige motivo y reutiliza RETURN', async () => {
    prisma.request.findUnique.mockResolvedValue(PENDING_ROW);
    await expect(service.returnRequest('req-1', undefined, 'u-enc', 'c1')).rejects.toThrow(BadRequestException);
    await expect(service.returnRequest('req-1', '  ', 'u-enc', 'c1')).rejects.toThrow(BadRequestException);
    requests.approve.mockResolvedValue({ id: 'req-1', status: 'PENDIENTE_GERENTE' });
    await service.returnRequest('req-1', 'Corregir grupo', 'u-enc', 'c1');
    expect(requests.approve).toHaveBeenCalledWith(
      'req-1', { action: 'RETURN', comment: 'Corregir grupo' }, 'u-enc', 'c1',
    );
  });

  it('rechazar exige motivo y reutiliza REJECT', async () => {
    prisma.request.findUnique.mockResolvedValue(PENDING_ROW);
    await expect(service.reject('req-1', undefined, 'u-enc', 'c1')).rejects.toThrow(BadRequestException);
    requests.approve.mockResolvedValue({ id: 'req-1', status: 'RECHAZADO' });
    await service.reject('req-1', 'Duplicado', 'u-enc', 'c1');
    expect(requests.approve).toHaveBeenCalledWith(
      'req-1', { action: 'REJECT', comment: 'Duplicado' }, 'u-enc', 'c1',
    );
  });
});

describe('15A — guards del controlador (backend autoridad final)', () => {
  const perm = (method: string): string[] =>
    Reflect.getMetadata(REQUIRE_PERMISSION_KEY, AprobacionAlmacenController.prototype[method]) ?? [];

  it('cola y detalle exigen WAREHOUSE_MANAGER.VIEW', () => {
    expect(perm('findPending')).toEqual(['WAREHOUSE_MANAGER.VIEW']);
    expect(perm('findOne')).toEqual(['WAREHOUSE_MANAGER.VIEW']);
  });

  it('aprobar/devolver/rechazar exigen WAREHOUSE_MANAGER.APPROVE', () => {
    expect(perm('approve')).toEqual(['WAREHOUSE_MANAGER.APPROVE']);
    expect(perm('returnRequest')).toEqual(['WAREHOUSE_MANAGER.APPROVE']);
    expect(perm('reject')).toEqual(['WAREHOUSE_MANAGER.APPROVE']);
  });

  it('WAREHOUSE.CLASSIFY no abre este controlador', () => {
    for (const m of ['findPending', 'findOne', 'approve', 'returnRequest', 'reject']) {
      expect(perm(m)).not.toContain('WAREHOUSE.CLASSIFY');
    }
  });
});

describe('15A — cadena de transiciones sin estados nuevos', () => {
  it('PENDIENTE_ALMACEN → ALMACEN_APROBADO → PENDIENTE_CONTABILIDAD', () => {
    expect(getNextWorkflowState('PENDIENTE_ALMACEN', 'APPROVE')).toBe('ALMACEN_APROBADO');
    expect(getNextWorkflowState('ALMACEN_APROBADO', 'APPROVE')).toBe('PENDIENTE_CONTABILIDAD');
    expect(getNextWorkflowState('ALMACEN_APROBADO', 'RETURN')).toBe('PENDIENTE_GERENTE');
    expect(getNextWorkflowState('ALMACEN_APROBADO', 'REJECT')).toBe('RECHAZADO');
  });

  it('mensaje de notificación de la nueva cola', () => {
    expect(stepNotificationMessage('ALMACEN_APROBADO', 'REQ-0007')).toMatchObject({
      title: 'REQ-0007 requiere aprobación del encargado de almacén.',
      toRequester: false,
    });
  });
});

describe('15A — notificaciones al Encargado (cola por permiso efectivo)', () => {
  function db() {
    return {
      department: { findUnique: vi.fn() },
      user: { findUnique: vi.fn(async ({ where }: any) => ({ id: where.id, active: true })) },
      userRole: {
        findMany: vi.fn(async () => [
          { userId: 'enc', role: { rolePermissions: [{ permission: { code: 'WAREHOUSE_MANAGER.APPROVE' } }] } },
          { userId: 'w1', role: { rolePermissions: [{ permission: { code: 'WAREHOUSE.CLASSIFY' } }] } },
        ]),
      },
      userPermissionOverride: { findMany: vi.fn(async () => []) },
    };
  }

  it('ALMACEN_APROBADO notifica al rol, excluye al actor', async () => {
    const svc = new NotificacionesService({} as any);
    const recipients = await svc.resolveStepRecipients(db(), {
      companyId: 'c1', departmentId: 'd1', stepCode: 'ALMACEN_APROBADO', excludeUserId: 'w1',
    });
    expect(recipients).toEqual(['enc']);
  });

  it('DENEGADO prevalece sobre el rol heredado', async () => {
    const svc = new NotificacionesService({} as any);
    const d = db();
    d.userPermissionOverride.findMany = vi.fn(async () => [
      { userId: 'enc', effect: 'DENEGADO', permission: { code: 'WAREHOUSE_MANAGER.APPROVE' } },
    ]);
    const recipients = await svc.resolveStepRecipients(d, {
      companyId: 'c1', departmentId: 'd1', stepCode: 'ALMACEN_APROBADO',
    });
    expect(recipients).toEqual([]);
  });
});

describe('15A — classify es borrador: sin estado, sin aviso, sin SSE (el aviso lo genera finalizar)', () => {
  it('guarda sin promover ni notificar', async () => {
    const notifyRequestStep = vi.fn(async () => [{ id: 'n1' }]);
    const emitMany = vi.fn();
    const requestUpdate = vi.fn(async () => ({}));
    const prisma: any = {
      request: { findUnique: vi.fn(async () => ({ id: 'req-1', status: 'PENDIENTE_ALMACEN', requestNumber: 'REQ-0001', companyId: 'c1', departmentId: 'd1' })) },
      $transaction: vi.fn(),
    };
    const catalogos = { resolveClassification: vi.fn() };
    // generateMasterCode usa masterItem + requestData.update; tx mock lo soporta.
    prisma.$transaction = vi.fn(async (fn: any) => fn({
      requestData: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async (a: any) => ({ id: 'rd-1', ...a.data })),
        update: vi.fn(async (a: any) => ({ id: 'rd-1', ...a.data, masterCode: 'RVHCAR000001' })),
      },
      request: { update: requestUpdate },
      auditEvent: { create: vi.fn(async () => ({})) },
      catalogGroup: { findUnique: vi.fn(async () => ({ id: 'g1', code: 'RVH' })) },
      catalogSubgroup: { findUnique: vi.fn(async () => ({ id: 'sg1', code: 'CAR' })) },
      masterItem: { findFirst: vi.fn(async () => null) },
    }));
    const svc = new SolicitudesService(prisma, catalogos as any, { notifyRequestStep } as any, { emitMany } as any);

    const result = await svc.classify('req-1', { groupId: 'g1', subgroupId: 'sg1' }, 'w1', 'c1');

    expect(result.masterCode).toBeDefined();
    expect(requestUpdate).not.toHaveBeenCalled();
    expect(notifyRequestStep).not.toHaveBeenCalled();
    expect(emitMany).not.toHaveBeenCalled();
  });
});
