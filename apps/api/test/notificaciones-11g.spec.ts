import { describe, it, expect, vi } from 'vitest';
import { NotificacionesService } from '../src/modulos/notificaciones/notificaciones.service';
import { SolicitudesService } from '../src/modulos/solicitudes/solicitud.service';

process.env.JWT_SECRET = 'test-secret-11g-notif';

interface NotifRow { id: string; userId: string; type: string; requestId: string | null; readAt: Date | null }

function seedNotifs(): NotifRow[] {
  return [
    { id: 'n-a1', userId: 'A', type: 'info', requestId: null, readAt: null },
    { id: 'n-a2', userId: 'A', type: 'info', requestId: null, readAt: new Date('2026-01-01') },
    { id: 'n-b1', userId: 'B', type: 'info', requestId: null, readAt: null },
  ];
}

function matchReadAt(r: NotifRow, cond: any): boolean {
  if (cond === undefined) return true;
  if (cond === null) return r.readAt === null;
  return r.readAt !== null;
}

function notifPrisma(rows: NotifRow[]) {
  return {
    notification: {
      findMany: vi.fn(async ({ where }: any) =>
        rows.filter(r =>
          (where.userId === undefined || r.userId === where.userId) &&
          (where.requestId === undefined || r.requestId === where.requestId) &&
          (where.type === undefined || r.type === where.type) &&
          matchReadAt(r, where.readAt),
        )),
      findFirst: vi.fn(async ({ where }: any) =>
        rows.find(r =>
          (where.id === undefined || r.id === where.id) &&
          (where.userId === undefined || r.userId === where.userId),
        ) ?? null),
      count: vi.fn(async ({ where }: any) =>
        rows.filter(r => r.userId === where.userId && matchReadAt(r, where.readAt)).length),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        for (const r of rows) {
          if (r.id === where.id && r.userId === where.userId && (where.readAt === undefined || matchReadAt(r, where.readAt))) {
            Object.assign(r, data);
            count += 1;
          } else if (where.id === undefined && r.userId === where.userId && r.readAt === null && data.readAt) {
            r.readAt = data.readAt;
            count += 1;
          }
        }
        return { count };
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `n-${rows.length}`, readAt: null, ...data };
        rows.push(row);
        return row;
      }),
      createMany: vi.fn(async ({ data }: any) => {
        for (const d of data) rows.push({ id: `n-${rows.length}`, readAt: null, ...d });
        return { count: data.length };
      }),
    },
  } as any;
}

const svc = (rows: NotifRow[]) => new NotificacionesService(notifPrisma(rows));

/** Store para resolución de destinatarios. */
function dirDb() {
  return {
    department: { findUnique: vi.fn(async ({ where }: any) => (where.id === 'd1' ? { managerId: 'mgr1' } : null)) },
    user: {
      findUnique: vi.fn(async ({ where }: any) =>
        ({ mgr1: { id: 'mgr1', active: true }, w1: { id: 'w1', active: true }, w2: { id: 'w2', active: true } } as any)[where.id] ?? null),
    },
    userRole: {
      findMany: vi.fn(async () => [
        { userId: 'w1', role: { rolePermissions: [{ permission: { code: 'WAREHOUSE.CLASSIFY' } }] } },
        { userId: 'w2', role: { rolePermissions: [{ permission: { code: 'WAREHOUSE.CLASSIFY' } }] } },
        { userId: 'acct', role: { rolePermissions: [{ permission: { code: 'ACCOUNTING.APPROVE' } }] } },
      ]),
    },
    userPermissionOverride: {
      findMany: vi.fn(async () => [
        { userId: 'w2', effect: 'DENEGADO', permission: { code: 'WAREHOUSE.CLASSIFY' } },
      ]),
    },
  };
}

describe('11G-B — aislamiento por usuario', () => {
  it('1. A obtiene solo A; unread-count aislado', async () => {
    const rows = seedNotifs();
    const service = svc(rows);
    expect((await service.findByUser('A')).map(r => r.id).sort()).toEqual(['n-a1', 'n-a2']);
    expect((await service.findByUser('B')).map(r => r.id)).toEqual(['n-b1']);
    expect(await service.countUnread('A')).toBe(1);
    expect(await service.countUnread('B')).toBe(1);
  });

  it('2. A no puede marcar como leída una notificación de B → 404', async () => {
    const rows = seedNotifs();
    await expect(svc(rows).markAsRead('n-b1', 'A')).rejects.toThrow(/no encontrada/i);
    expect(rows.find(r => r.id === 'n-b1')!.readAt).toBeNull();
  });

  it('3. marcar propia funciona', async () => {
    const rows = seedNotifs();
    await svc(rows).markAsRead('n-a1', 'A');
    expect(rows.find(r => r.id === 'n-a1')!.readAt).toBeTruthy();
    expect(await svc(rows).countUnread('A')).toBe(0);
  });

  it('4. read-all solo afecta al usuario propio', async () => {
    const rows = seedNotifs();
    await svc(rows).markAllAsRead('A');
    expect(rows.find(r => r.id === 'n-a1')!.readAt).toBeTruthy();
    expect(rows.find(r => r.id === 'n-b1')!.readAt).toBeNull();
  });
});

describe('11G-B — resolución de destinatarios', () => {
  it('5. PENDIENTE_GERENTE → gerente individual', async () => {
    const service = new NotificacionesService({} as any);
    const dest = await service.resolveStepRecipients(dirDb() as any, {
      companyId: 'c1', departmentId: 'd1', stepCode: 'PENDIENTE_GERENTE', excludeUserId: 'req1',
    });
    expect(dest).toEqual(['mgr1']);
  });

  it('6. PENDIENTE_ALMACEN → cola con permiso, sin DENEGADO ni actor', async () => {
    const service = new NotificacionesService({} as any);
    const dest = await service.resolveStepRecipients(dirDb() as any, {
      companyId: 'c1', departmentId: 'd1', stepCode: 'PENDIENTE_ALMACEN', excludeUserId: 'w1',
    });
    expect(dest).toEqual([]);
    const dest2 = await service.resolveStepRecipients(dirDb() as any, {
      companyId: 'c1', departmentId: 'd1', stepCode: 'PENDIENTE_ALMACEN', excludeUserId: 'req1',
    });
    expect(dest2).toEqual(['w1']);
  });

  it('7. paso desconocido → nadie', async () => {
    const service = new NotificacionesService({} as any);
    expect(await service.resolveStepRecipients(dirDb() as any, {
      companyId: 'c1', departmentId: 'd1', stepCode: 'RECHAZADO',
    })).toEqual([]);
  });
});

describe('11G-B — creación idempotente + submit', () => {
  function txWith(rows: NotifRow[], request: any) {
    const db = dirDb();
    const tx: any = {
      ...db,
      request: { findUnique: vi.fn(), update: vi.fn(async () => ({})) },
      workflowInstance: { create: vi.fn(async () => ({ id: 'inst1' })) },
      workflowTask: { create: vi.fn(async () => ({})) },
      workflowHistory: { create: vi.fn(async () => ({})) },
      approval: { create: vi.fn(async () => ({})) },
      auditEvent: { create: vi.fn(async () => ({})) },
      notification: notifPrisma(rows).notification,
    };
    const prisma: any = {
      request: { findUnique: vi.fn(async () => request) },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    };
    return { prisma, tx };
  }

  it('8. submit notifica al gerente con requestId y link', async () => {
    const rows: NotifRow[] = [];
    const { prisma } = txWith(rows, { id: 'req1', status: 'BORRADOR', departmentId: 'd1' });
    const notif = new NotificacionesService(prisma);
    const emitted: any[] = [];
    const service = new SolicitudesService(prisma, {} as any, notif, { emitMany: (rows: any[]) => { emitted.push(...rows); } } as any);
    await service.submit('req1', 'req-user', 'c1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: 'mgr1',
      requestId: 'req1',
      type: 'PENDIENTE_GERENTE',
      link: '/requester/req1',
      readAt: null,
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ userId: 'mgr1', requestId: 'req1' });
  });

  it('9. reintento de submit no duplica (misma transacción repetida)', async () => {
    const rows: NotifRow[] = [];
    const { prisma } = txWith(rows, { id: 'req1', status: 'BORRADOR', departmentId: 'd1' });
    const notif = new NotificacionesService(prisma);
    const tx: any = {
      ...dirDb(),
      notification: notifPrisma(rows).notification,
    };
    await notif.notifyRequestStep(tx, {
      requestId: 'req1', requestNumber: 'REQ-0001', companyId: 'c1', departmentId: 'd1',
      stepCode: 'PENDIENTE_GERENTE', actorId: 'req-user', title: 'T', body: 'B',
    });
    await notif.notifyRequestStep(tx, {
      requestId: 'req1', requestNumber: 'REQ-0001', companyId: 'c1', departmentId: 'd1',
      stepCode: 'PENDIENTE_GERENTE', actorId: 'req-user', title: 'T', body: 'B',
    });
    expect(rows.filter(r => r.userId === 'mgr1')).toHaveLength(1);
  });
});
