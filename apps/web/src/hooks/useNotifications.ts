import * as React from 'react';
import { apiNotificacionService } from '../servicios/api/api-notificacion-service';
import type { Notification } from '../tipos';

const MAX_BACKOFF_MS = 30000;

function backoffDelay(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
  return base / 2 + Math.random() * (base / 2);
}

function mergeById(prev: Notification[], incoming: Notification[]): Notification[] {
  const seen = new Set(prev.map(n => n.id));
  const fresh = incoming.filter(n => !seen.has(n.id));
  if (fresh.length === 0) return prev;
  return [...fresh, ...prev]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 50);
}

/**
 * 12F — Notificaciones en tiempo real: SSE primario + reconciliación por API.
 * - Una conexión por montaje (AppLayout); userId siempre de sesión.
 * - Dedupe local por id (multipestaña/reconexión no duplican visualmente).
 * - Backoff con jitter; visibilitychange reconcilia al volver.
 * - Sin polling periódico; sin sonidos.
 */
export function useNotifications() {
  const [notifs, setNotifs] = React.useState<Notification[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<Notification | null>(null);
  const attemptRef = React.useRef(0);
  const esRef = React.useRef<EventSource | null>(null);
  const closedRef = React.useRef(false);
  const toastTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const reconcile = React.useCallback(async () => {
    try {
      const [list, count] = await Promise.all([
        apiNotificacionService.getNotificaciones(),
        apiNotificacionService.getUnreadCount(),
      ]);
      setNotifs(prev => mergeById(prev, list));
      setUnread(count);
      setError(null);
    } catch {
      setError('No se pudieron cargar las notificaciones.');
    }
  }, []);

  const flashToast = React.useCallback((n: Notification) => {
    setToast(n);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  React.useEffect(() => {
    closedRef.current = false;
    setLoading(true);
    void reconcile().finally(() => setLoading(false));

    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closedRef.current) return;
      if (typeof EventSource === 'undefined') return;
      const es = new EventSource('/api/v1/notificaciones/stream');
      esRef.current = es;
      es.onopen = () => {
        attemptRef.current = 0;
        void reconcile();
      };
      es.onmessage = (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data);
          if (!data || typeof data.id !== 'string') return;
          const n = data as Notification;
          setNotifs(prev => mergeById(prev, [n]));
          setUnread(u => u + 1);
          flashToast(n);
        } catch {
          /* mensaje no JSON: ignorar */
        }
      };
      es.onerror = () => {
        try {
          es.close();
        } catch {
          /* noop */
        }
        esRef.current = null;
        if (closedRef.current) return;
        const wait = backoffDelay(attemptRef.current++);
        timer = setTimeout(connect, wait);
      };
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void reconcile();
    };

    connect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      closedRef.current = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearTimeout(timer);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      try {
        esRef.current?.close();
      } catch {
        /* noop */
      }
      esRef.current = null;
    };
  }, [reconcile, flashToast]);

  const markOne = React.useCallback(async (id: string, link?: string): Promise<string | undefined> => {
    try {
      await apiNotificacionService.markAsRead(id);
    } catch {
      /* ya leída o ajena: reconciliar igual */
    }
    setNotifs(prev => prev.map(n => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnread(u => Math.max(0, u - 1));
    void reconcile();
    return link;
  }, [reconcile]);

  const markAll = React.useCallback(async () => {
    try {
      await apiNotificacionService.markAllAsRead();
    } catch {
      /* reconciliar igual */
    }
    setUnread(0);
    setNotifs(prev => prev.map(n => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    void reconcile();
  }, [reconcile]);

  const dismissToast = React.useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  return { notifs, unread, loading, error, toast, dismissToast, markOne, markAll, reconcile };
}

/** "Hace 10 segundos / Hace 4 minutos" sin dependencias. */
export function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - +new Date(iso)) / 1000));
  if (s < 60) return `Hace ${s} segundo${s === 1 ? '' : 's'}`;
  const m = Math.floor(s / 60);
  if (m < 60) return `Hace ${m} minuto${m === 1 ? '' : 's'}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Hace ${h} hora${h === 1 ? '' : 's'}`;
  const d = Math.floor(h / 24);
  if (d < 30) return `Hace ${d} día${d === 1 ? '' : 's'}`;
  return new Date(iso).toLocaleDateString('es-VE');
}
