import { describe, it, expect, vi } from 'vitest';
import { firstValueFrom, take, toArray } from 'rxjs';
import { SseService } from '../src/modulos/notificaciones/sse.service';
import { NotificacionesController } from '../src/modulos/notificaciones/notificaciones.controller';
import { stepNotificationMessage } from '../src/modulos/solicitudes/solicitud.service';

process.env.JWT_SECRET = 'test-secret-12f';

const N = (over: any = {}) => ({
  id: 'n1',
  userId: 'A',
  requestId: 'req1',
  type: 'PENDIENTE_ALMACEN',
  title: 'T',
  body: 'B',
  link: '/requester/req1',
  createdAt: new Date('2026-09-09T10:00:00Z'),
  ...over,
});

describe('12F — SSE por usuario', () => {
  it('1. emite solo al destinatario (otras pestañas del mismo usuario sí)', async () => {
    const sse = new SseService();
    const gotA1: any[] = [];
    const gotA2: any[] = [];
    const gotB: any[] = [];
    const sub1 = sse.streamFor('A').subscribe(v => gotA1.push(v));
    const sub2 = sse.streamFor('A').subscribe(v => gotA2.push(v));
    const subB = sse.streamFor('B').subscribe(v => gotB.push(v));
    sse.emitMany([N({ userId: 'A' })]);
    expect(gotA1).toHaveLength(1);
    expect(gotA2).toHaveLength(1);
    expect(gotB).toHaveLength(0);
    sub1.unsubscribe();
    sub2.unsubscribe();
    subB.unsubscribe();
    sse.onModuleDestroy();
  });

  it('2. cleanup elimina conexiones cerradas', () => {
    const sse = new SseService();
    const sub = sse.streamFor('A').subscribe(() => {});
    expect(sse.connectionCount()).toMatchObject({ A: 1 });
    sub.unsubscribe();
    expect(sse.connectionCount()).toEqual({});
    sse.onModuleDestroy();
  });

  it('3. stream del controller solo entrega eventos propios', async () => {
    const sse = new SseService();
    const notifSvc: any = { findUnreadSince: vi.fn() };
    const ctrl = new NotificacionesController(notifSvc, sse);
    const req: any = { headers: {} };
    const obs: any = ctrl.stream({ id: 'A' } as any, req);
    const got: any[] = [];
    const sub = obs.subscribe((e: any) => { if (e.type === 'notification') got.push(e.data); });
    sse.emitMany([N({ userId: 'B' }), N({ userId: 'A' })]);
    await new Promise(r => setTimeout(r, 20));
    expect(got.map(g => g.userId)).toEqual(['A']);
    expect(got[0].id).toBe('n1');
    sub.unsubscribe();
    sse.onModuleDestroy();
  });

  it('4. Last-Event-ID reenvía no leídas perdidas', async () => {
    const sse = new SseService();
    const missed = [N({ id: 'n-old' })];
    const notifSvc: any = { findUnreadSince: vi.fn(async () => missed) };
    const ctrl = new NotificacionesController(notifSvc, sse);
    const req: any = { headers: { 'last-event-id': 'n-prev' } };
    const obs: any = ctrl.stream({ id: 'A' } as any, req);
    const got: any[] = await firstValueFrom(obs.pipe(take(1), toArray()).pipe());
    expect(notifSvc.findUnreadSince).toHaveBeenCalledWith('A', 'n-prev');
    expect(got[0].data.id).toBe('n-old');
    sse.onModuleDestroy();
  });

  it('5. sin Last-Event-ID no hay replay', async () => {
    const sse = new SseService();
    const notifSvc: any = { findUnreadSince: vi.fn() };
    const ctrl = new NotificacionesController(notifSvc, sse);
    const sub = (ctrl.stream({ id: 'A' } as any, { headers: {} } as any) as any).subscribe(() => {});
    await new Promise(r => setTimeout(r, 20));
    expect(notifSvc.findUnreadSince).not.toHaveBeenCalled();
    sub.unsubscribe();
    sse.onModuleDestroy();
  });
});

describe('12F — mensajes accionables por etapa', () => {
  it('6. almacén/contabilidad/maestra/gerente accionables', () => {
    expect(stepNotificationMessage('PENDIENTE_ALMACEN', 'REQ-0045')).toMatchObject({
      title: 'REQ-0045 requiere clasificación.', toRequester: false,
    });
    expect(stepNotificationMessage('PENDIENTE_CONTABILIDAD', 'REQ-0045').title).toBe('REQ-0045 requiere aprobación contable.');
    expect(stepNotificationMessage('PENDIENTE_VALIDACION_MAESTRA', 'REQ-0045').title).toBe('REQ-0045 requiere validación maestra.');
    expect(stepNotificationMessage('PENDIENTE_GERENTE', 'REQ-0045').title).toBe('REQ-0045 requiere aprobación de gerente.');
  });

  it('7. devolución indica motivo y acción', () => {
    const m = stepNotificationMessage('PENDIENTE_GERENTE', 'REQ-0045', 'RETURN', 'falta propósito');
    expect(m.title).toBe('Tu solicitud REQ-0045 fue devuelta para corrección.');
    expect(m.body).toMatch(/falta propósito/);
    expect(m.body).toMatch(/corregir y reenviar/);
    expect(m.toRequester).toBe(true);
  });

  it('8. rechazo y final al solicitante sin afirmar registro Profit', () => {
    const r = stepNotificationMessage('RECHAZADO', 'REQ-0045', 'REJECT', 'no');
    expect(r.title).toBe('Tu solicitud REQ-0045 fue rechazada.');
    const f = stepNotificationMessage('APROBADO_FINAL', 'REQ-0045', 'APPROVE');
    expect(f.title).toBe('Tu solicitud REQ-0045 fue aprobada.');
    expect(f.body).toMatch(/lista para su registro en Profit/);
    expect(f.body).not.toMatch(/registrada en Profit|fue introducida/);
  });
});
