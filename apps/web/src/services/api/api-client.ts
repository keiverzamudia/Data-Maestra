const BASE = import.meta.env.VITE_API_URL ?? '';

interface ApiError {
  status: number;
  message: string;
  error?: unknown;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(body ? {} : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    let errBody: { message?: string; error?: unknown } | undefined;
    try {
      errBody = await res.json();
    } catch {
      // no json body
    }
    throw { status: res.status, message: errBody?.message ?? res.statusText, error: errBody?.error } as ApiError;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export type { ApiError };