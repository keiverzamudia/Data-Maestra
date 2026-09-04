const BASE = import.meta.env.VITE_API_URL ?? '';

interface ApiError {
  status: number;
  message: string;
  error?: unknown;
}

// FASE 10E: 401 → el handler registrado (SessionContext) limpia la
// autenticación. Sin loops: solo notifica, no reintenta ni redirige aquí.
// 403 → se propaga como error (usuario sigue autenticado).
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

async function requestWithRetry<T>(method: string, path: string, body?: unknown, retries = 3, delayMs = 1000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        // FASE 10E: envía la cookie HttpOnly dm_session (mismo origen en dev).
        credentials: 'include',
        ...(body ? { body: JSON.stringify(body) } : {}),
      });

      if (res.status === 401 && !path.includes('/auth/login') && unauthorizedHandler) {
        try { unauthorizedHandler(); } catch {}
      }

      if (!res.ok) {
        let errBody: { message?: string; error?: unknown } | undefined;
        try { errBody = await res.json(); } catch {}
        throw { status: res.status, message: errBody?.message ?? res.statusText, error: errBody?.error } as ApiError;
      }

      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    } catch (err: any) {
      if (attempt < retries && (err?.code === 'ECONNREFUSED' || err?.message?.includes('Failed to fetch') || err?.name === 'TypeError')) {
        await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}

export const api = {
  get: <T>(path: string) => requestWithRetry<T>('GET', path),
  post: <T>(path: string, body?: unknown) => requestWithRetry<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => requestWithRetry<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => requestWithRetry<T>('PATCH', path, body),
  delete: <T>(path: string) => requestWithRetry<T>('DELETE', path),
};

export type { ApiError };
