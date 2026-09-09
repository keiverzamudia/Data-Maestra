import * as React from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../contextos/SessionContext';

/**
 * 10L — Autorización VISUAL basada en permisos efectivos del backend.
 * <Can> NO protege endpoints: el backend (JwtGuard+RbacGuard) sigue siendo
 * la autoridad. Sin matriz de roles hardcodeada; se evalúa por código.
 */
export const Can: React.FC<{ permission: string; fallback?: React.ReactNode; children: React.ReactNode }> = ({
  permission,
  fallback = null,
  children,
}) => {
  const { hasPermission } = useSession();
  return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
};

/** Pantalla de acceso denegado (sin redirecciones, sin loops). */
export const AccessDenied: React.FC<{ permission: string }> = ({ permission }) => (
  <div className="stack">
    <div className="card p16">
      <h3 className="h1" style={{ fontSize: 16 }}>Acceso denegado</h3>
      <p className="muted small">No tienes permiso para ver esta sección. Permiso requerido: <code>{permission}</code></p>
      <Link className="btn btn-secondary" to="/">Volver al inicio</Link>
    </div>
  </div>
);

/**
 * Protección de ruta reutilizable. Mientras la sesión/permisos cargan muestra
 * el estado de carga existente (nunca todas las opciones). Sin permiso →
 * acceso denegado. Nunca redirige en loop.
 */
export const RequirePermission: React.FC<{ permission: string; children: React.ReactNode }> = ({
  permission,
  children,
}) => {
  const { loading, authenticated, hasPermission } = useSession();
  if (loading) return <div className="empty">Cargando sesión…</div>;
  if (!authenticated || !hasPermission(permission)) return <AccessDenied permission={permission} />;
  return <>{children}</>;
};
