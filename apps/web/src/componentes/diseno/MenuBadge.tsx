import * as React from 'react';

export type MenuBadgeStatus = 'loading' | 'error' | 'ready';

/**
 * FASE — Badge reutilizable del menú / secciones de trabajo.
 * - loading → "…" (nunca un número falso)
 * - error   → "—"  (nunca inventar 0)
 * - 0       → "0" con estilo neutro
 * - N > 0   → "N" con énfasis sutil
 */
export const MenuBadge: React.FC<{
  value?: number;
  status?: MenuBadgeStatus;
  /** Etiqueta accesible del contador (ej. "pendientes en Almacén"). */
  label?: string;
}> = ({ value, status = 'ready', label }) => {
  if (status === 'loading') {
    return (
      <span className="nav-badge nav-badge-loading" role="status" aria-label={label ? `Cargando ${label}` : 'Cargando contador'} aria-live="polite">
        …
      </span>
    );
  }
  if (status === 'error' || value === undefined || value === null || Number.isNaN(value)) {
    return (
      <span className="nav-badge nav-badge-error" role="status" aria-label={label ? `${label}: no disponible` : 'Contador no disponible'} title="Contador no disponible">
        —
      </span>
    );
  }
  const n = Math.max(0, Math.trunc(value));
  const emphasize = n > 0;
  return (
    <span
      className={`nav-badge ${emphasize ? 'nav-badge-active' : 'nav-badge-zero'}`}
      aria-label={label ? `${n} ${label}` : String(n)}
      title={label ? `${n} ${label}` : undefined}
    >
      {n > 99 ? '99+' : String(n)}
    </span>
  );
};
