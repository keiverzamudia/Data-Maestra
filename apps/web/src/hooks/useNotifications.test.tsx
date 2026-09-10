// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { useNotifications } from './useNotifications';
import { apiNotificacionService } from '../servicios/api/api-notificacion-service';

vi.mock('../servicios/api/api-notificacion-service', () => ({
  apiNotificacionService: {
    getNotificaciones: vi.fn(),
    getUnreadCount: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
  },
}));

const listMock = apiNotificacionService.getNotificaciones as any;
const countMock = apiNotificacionService.getUnreadCount as any;

class FakeES {
  static instances: FakeES[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeES.instances.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }
  close() {
    this.closed = true;
  }
}

function Harness() {
  const h = useNotifications();
  return (
    <div>
      <span>unread:{h.unread}</span>
      <span>titles:{h.notifs.map(n => n.title).join('|')}</span>
      <button onClick={() => void h.markAll()}>all</button>
    </div>
  );
}

describe('useNotifications 12F', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeES.instances = [];
    (globalThis as any).EventSource = FakeES;
    listMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
  });
  afterEach(() => {
    cleanup();
    delete (globalThis as any).EventSource;
  });

  it('conecta SSE y suma entrantes sin refresh', async () => {
    render(<Harness />);
    await waitFor(() => expect(FakeES.instances).toHaveLength(1));
    expect(FakeES.instances[0]!.url).toBe('/api/v1/notificaciones/stream');
    await waitFor(() => expect(screen.getByText('unread:0')).toBeTruthy());
    const calls = listMock.mock.calls.length;
    act(() => {
      FakeES.instances[0]!.onmessage?.({ data: JSON.stringify({ id: 'n9', title: 'REQ-1 requiere clasificación.', body: 'B', type: 'PENDIENTE_ALMACEN', readAt: null, createdAt: new Date().toISOString(), link: '/requester/r1' }) });
    });
    expect(await screen.findByText('unread:1')).toBeTruthy();
    expect(listMock.mock.calls.length).toBe(calls);
    expect(screen.getByText(/REQ-1 requiere/)).toBeTruthy();
  });

  it('duplicados por reconexión/multipestaña no se repiten', async () => {
    render(<Harness />);
    await waitFor(() => expect(FakeES.instances).toHaveLength(1));
    const msg = { data: JSON.stringify({ id: 'n9', title: 'Duplicada', body: 'B', type: 'info', readAt: null, createdAt: new Date().toISOString() }) };
    act(() => {
      FakeES.instances[0]!.onmessage?.(msg);
      FakeES.instances[0]!.onmessage?.(msg);
    });
    await waitFor(() => expect(screen.getByText('unread:2')).toBeTruthy());
    // en el listado una sola vez (el toast aparte es efímero)
    expect(screen.getByText('titles:Duplicada')).toBeTruthy();
  });

  it('error de socket reintenta con backoff (nueva conexión)', async () => {
    render(<Harness />);
    await waitFor(() => expect(FakeES.instances).toHaveLength(1));
    act(() => {
      FakeES.instances[0]!.onerror?.();
    });
    await waitFor(() => expect(FakeES.instances.length).toBeGreaterThanOrEqual(2), { timeout: 8000 });
  });

  it('volver visible reconcilia por API', async () => {
    render(<Harness />);
    await waitFor(() => expect(FakeES.instances).toHaveLength(1));
    const calls = listMock.mock.calls.length;
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(calls));
  });
});
