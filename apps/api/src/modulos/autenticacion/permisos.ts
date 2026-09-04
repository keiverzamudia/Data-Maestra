/**
 * FASE 10E — PUENTE TEMPORAL DE PERMISOS. TODO(10F).
 *
 * La identidad ya es 100% real (JWT → Session → request.user). Los CONJUNTOS
 * de permisos por rol siguen definidos aquí porque `role_permissions` está
 * vacía en BD y poblarla es 10F. 10F reemplazará esto por:
 *   request.user → UserRole → Role → RolePermission → Permission (+overrides).
 * NO agregar administración de roles/permisos aquí.
 */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  REQUESTER: ['REQUEST.CREATE', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  DEPARTMENT_MANAGER: ['MANAGER.APPROVE', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  WAREHOUSE: ['WAREHOUSE.CLASSIFY', 'WAREHOUSE.VIEW', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  ACCOUNTING: ['ACCOUNTING.APPROVE', 'ACCOUNTING.VIEW', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  FINAL_REVIEWER: ['FINAL_REVIEW.APPROVE', 'REQUEST.VIEW', 'DASHBOARD.VIEW'],
  MASTER_DATA_ADMIN: ['ADMIN.MANAGE', 'DASHBOARD.VIEW', 'AUDIT.VIEW', 'IMPORT.RUN', 'IMPORT.VIEW'],
  // NOTA: AUDITOR existe en BD sin conjunto definido → resuelve [] hasta 10F.
};

export function resolvePermissionsForRoles(roleCodes: string[]): string[] {
  const out = new Set<string>();
  for (const code of roleCodes) {
    for (const p of ROLE_PERMISSIONS[code] ?? []) out.add(p);
  }
  return Array.from(out);
}
