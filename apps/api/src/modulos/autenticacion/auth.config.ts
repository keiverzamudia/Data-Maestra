/**
 * FASE 10E — Configuración centralizada de autenticación (único punto).
 * JWT_SECRET por variable de entorno; en producción sin él la app falla
 * explícito al arrancar. En dev existe fallback claramente identificado.
 */
function required(name: string): string {
  const v = process.env[name];
  if (v) return v;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Configuración ausente: ${name} es obligatorio en producción.`);
  }
  return '';
}

const DEV_FALLBACK_JWT_SECRET = 'dev-only-insecure-jwt-secret-change-me';

export function getJwtSecret(): string {
  const v = required('JWT_SECRET');
  return v || DEV_FALLBACK_JWT_SECRET;
}

export function getSessionTtlHours(): number {
  const v = Number(process.env.AUTH_SESSION_TTL_HOURS ?? 8);
  return Number.isFinite(v) && v > 0 ? v : 8;
}

export const AUTH_COOKIE_NAME = 'dm_session';
