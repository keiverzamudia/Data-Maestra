/**
 * 10L — Navegación dinámica por permisos efectivos (códigos del catálogo backend).
 * 14G — Grupos Operación/Trabajo/Administración que representan el workflow.
 * 16A — Sin Validación Maestra, Aprobación Final ni Profit standalone:
 * Contabilidad es la última aprobación humana y Profit vive en su detalle.
 * Entrada a sección por permiso VIEW; acciones por su permiso específico.
 */
export type NavGroup = 'operacion' | 'trabajo' | 'administracion';

export const GROUP_LABEL: Record<NavGroup, string> = {
  operacion: 'Operación',
  trabajo: 'Trabajo',
  administracion: 'Administración',
};

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
  group: NavGroup;
  /** Rutas legacy que resuelven al mismo destino (breadcrumbs, sin mostrar). */
  aliases?: string[];
  children?: NavChild[];
}

export const NAV: NavEntry[] = [
  { key: 'dashboard', to: '/', label: 'Dashboard', icon: '◧', permission: 'DASHBOARD.VIEW', group: 'operacion' },
  {
    key: 'solicitudes', to: '/solicitudes', label: 'Mis solicitudes', icon: '◻', permission: 'REQUEST.VIEW',
    group: 'operacion', aliases: ['/requester'],
    children: [{ key: 'new', to: '/requester/new', label: 'Crear solicitud', permission: 'REQUEST.CREATE' }],
  },
  { key: 'approvals', to: '/approvals', label: 'Aprobaciones', icon: '✔', permission: 'MANAGER.APPROVE', group: 'trabajo' },
  { key: 'warehouse', to: '/warehouse', label: 'Almacén', icon: '▭', permission: 'WAREHOUSE.VIEW', group: 'trabajo' },
  // 15A — cola del Encargado de Almacén (permiso propio, no duplica Almacén).
  { key: 'warehouse-approval', to: '/aprobacion-almacen', label: 'Aprobación Almacén', icon: '✔▭', permission: 'WAREHOUSE_MANAGER.VIEW', group: 'trabajo' },
  { key: 'accounting', to: '/accounting', label: 'Contabilidad', icon: '✓', permission: 'ACCOUNTING.VIEW', group: 'trabajo' },
  { key: 'imports', to: '/imports', label: 'Importaciones', icon: '↻', permission: 'IMPORT.VIEW', group: 'administracion' },
  {
    key: 'admin', label: 'Administración', icon: '⚙', group: 'administracion',
    children: [
      { key: 'admin-personas', to: '/admin', label: 'Personas y acceso', permission: 'ADMIN.MANAGE' },
      { key: 'admin-organizacion', to: '/admin/organizacion', label: 'Organización', permission: 'ADMIN.MANAGE' },
      { key: 'admin-roles', to: '/admin/roles', label: 'Roles y permisos', permission: 'ADMIN.MANAGE' },
      { key: 'admin-catalogos', to: '/admin/catalogos', label: 'Catálogos Profit', permission: 'ADMIN.MANAGE' },
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

/** ¿El path pertenece a la entrada (ruta propia o alias legacy)? */
export function navMatches(entry: NavEntry, pathname: string): boolean {
  if (entry.to && (pathname === entry.to || pathname.startsWith(entry.to + '/'))) return true;
  for (const a of entry.aliases ?? []) {
    if (pathname === a || pathname.startsWith(a + '/')) return true;
  }
  for (const c of entry.children ?? []) {
    if (pathname === c.to || pathname.startsWith(c.to + '/')) return true;
  }
  return false;
}
