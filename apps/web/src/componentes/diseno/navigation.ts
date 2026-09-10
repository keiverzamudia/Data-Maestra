/**
 * 10L — Navegación dinámica por permisos efectivos (códigos del catálogo backend).
 * Entrada a sección por permiso VIEW; acciones (crear/clasificar/aprobar) por su
 * permiso específico dentro de cada página. Sin roles hardcodeados.
 */
export interface NavChild {
  key: string;
  to: string;
  label: string;
  permission: string;
}

export interface NavEntry {
  key: string;
  to?: string;
  label: string;
  icon: string;
  permission?: string;
  children?: NavChild[];
}

export const NAV: NavEntry[] = [
  { key: 'dashboard', to: '/', label: 'Dashboard', icon: '◧', permission: 'DASHBOARD.VIEW' },
  {
    key: 'solicitudes', to: '/requester', label: 'Solicitudes', icon: '◻', permission: 'REQUEST.VIEW',
    children: [{ key: 'new', to: '/requester/new', label: 'Crear solicitud', permission: 'REQUEST.CREATE' }],
  },
  { key: 'approvals', to: '/approvals', label: 'Aprobaciones', icon: '✔', permission: 'MANAGER.APPROVE' },
  { key: 'warehouse', to: '/warehouse', label: 'Almacén', icon: '▭', permission: 'WAREHOUSE.VIEW' },
  { key: 'accounting', to: '/accounting', label: 'Contabilidad', icon: '✓', permission: 'ACCOUNTING.VIEW' },
  { key: 'final-review', to: '/final-review', label: 'Aprobación Final', icon: '★', permission: 'FINAL_REVIEW.APPROVE' },
  { key: 'imports', to: '/imports', label: 'Importaciones', icon: '↻', permission: 'IMPORT.VIEW' },
  {
    key: 'admin', label: 'Administración', icon: '⚙',
    children: [
      { key: 'admin-personas', to: '/admin', label: 'Personas y acceso', permission: 'ADMIN.MANAGE' },
      { key: 'admin-organizacion', to: '/admin/organizacion', label: 'Organización', permission: 'ADMIN.MANAGE' },
      { key: 'admin-roles', to: '/admin/roles', label: 'Roles y permisos', permission: 'ADMIN.MANAGE' },
      { key: 'audit', to: '/audit', label: 'Auditoría', permission: 'AUDIT.VIEW' },
    ],
  },
];

/** Filtra por permisos efectivos; elimina hijos no visibles y padres sin acceso. */
export function visibleNav(has: (p: string) => boolean): NavEntry[] {
  const out: NavEntry[] = [];
  for (const n of NAV) {
    if (n.children) {
      const children = n.children.filter(c => has(c.permission));
      const parentOk = !n.permission || has(n.permission);
      // Sin hijos visibles y sin acceso propio (o sin ruta propia): ocultar.
      if (children.length === 0 && (!parentOk || !n.to)) continue;
      out.push({ ...n, children });
    } else if (n.permission && has(n.permission)) {
      out.push(n);
    }
  }
  return out;
}
