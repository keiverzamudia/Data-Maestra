/**
 * FASE 18 §9-§12 — Vista principal por rol.
 * Mapa centralizado vista → ruta + permiso requerido. La vista NO concede
 * permisos: si el usuario no tiene el permiso de la vista configurada, se
 * usa el fallback seguro (Mis solicitudes). Puro y testeable.
 */

export type RoleViewKey =
  | 'solicitudes'
  | 'dashboard'
  | 'approvals'
  | 'warehouse'
  | 'aprobacion-almacen'
  | 'accounting';

export interface RoleViewDef {
  key: RoleViewKey;
  label: string;
  route: string;
  permission: string;
}

/** Únicas vistas configurables (rutas reales existentes, §10/§22). */
export const ROLE_VIEWS: Record<RoleViewKey, RoleViewDef> = {
  solicitudes: { key: 'solicitudes', label: 'Mis solicitudes', route: '/solicitudes', permission: 'REQUEST.VIEW' },
  dashboard: { key: 'dashboard', label: 'Dashboard Gerencial', route: '/', permission: 'DASHBOARD.VIEW' },
  approvals: { key: 'approvals', label: 'Aprobaciones', route: '/approvals', permission: 'MANAGER.APPROVE' },
  warehouse: { key: 'warehouse', label: 'Almacén', route: '/warehouse', permission: 'WAREHOUSE.VIEW' },
  'aprobacion-almacen': { key: 'aprobacion-almacen', label: 'Aprobación Almacén', route: '/aprobacion-almacen', permission: 'WAREHOUSE_MANAGER.VIEW' },
  accounting: { key: 'accounting', label: 'Contabilidad', route: '/accounting', permission: 'ACCOUNTING.VIEW' },
};

export const ROLE_VIEW_KEYS = Object.keys(ROLE_VIEWS) as RoleViewKey[];

/** Fallback seguro y determinístico (§11): Mis solicitudes. */
export const DEFAULT_ROLE_VIEW: RoleViewKey = 'solicitudes';

export function isRoleViewKey(v: unknown): v is RoleViewKey {
  return typeof v === 'string' && (ROLE_VIEW_KEYS as string[]).includes(v);
}

/**
 * Resuelve la vista principal de un usuario a partir de las vistas
 * configuradas en sus roles (ordenados por código para determinismo).
 * Solo se acepta una vista si el usuario tiene su permiso; en cualquier
 * otro caso, fallback a Mis solicitudes. La vista nunca otorga permisos.
 */
export function resolveDefaultView(
  roleViews: Array<{ roleCode: string; defaultView: RoleViewKey | null }>,
  hasPermission: (p: string) => boolean,
): RoleViewDef {
  const ordered = [...roleViews].sort((a, b) => a.roleCode.localeCompare(b.roleCode));
  for (const r of ordered) {
    if (!r.defaultView || !isRoleViewKey(r.defaultView)) continue;
    const def = ROLE_VIEWS[r.defaultView];
    if (hasPermission(def.permission)) return def;
  }
  return ROLE_VIEWS[DEFAULT_ROLE_VIEW];
}
