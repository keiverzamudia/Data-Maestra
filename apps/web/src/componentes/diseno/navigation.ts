/**
 * 10L — Navegación dinámica por permisos efectivos (códigos del catálogo backend).
 * 14G — Grupos Operación/Trabajo/Administración que representan el workflow.
 * 16A — Sin Validación Maestra, Aprobación Final ni Profit standalone:
 * Contabilidad es la última aprobación humana y Profit vive en su detalle.
 * Entrada a sección por permiso VIEW; acciones por su permiso específico.
 * Iconografía: lucide-react, estilo outline único (stroke 1.8, 18px),
 * un icono semántico por destino. Sin emojis ni glifos improvisados.
 */
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  FileText,
  FilePlus2,
  ClipboardCheck,
  Warehouse,
  PackageCheck,
  Calculator,
  Import,
  Settings,
  UsersRound,
  Building2,
  ShieldCheck,
  Database,
  ScrollText,
  GitCompare,
  Factory,
} from 'lucide-react';

export type NavGroup = 'operacion' | 'trabajo' | 'administracion';

/** Claves de contador del resumen contextual (RequestContextSummary.work). */
export type NavBadgeKey =
  | 'approvals'
  | 'warehouse'
  | 'warehouseApproval'
  | 'accounting'
  | 'managementApproval';

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
  /** Icono propio; si se omite se usa el de la entrada padre. */
  icon?: LucideIcon;
  /** Clave del contador contextual (badges del menú). */
  badge?: NavBadgeKey;
}

export interface NavEntry {
  key: string;
  to?: string;
  label: string;
  icon: LucideIcon;
  permission?: string;
  group: NavGroup;
  /** Rutas legacy que resuelven al mismo destino (breadcrumbs, sin mostrar). */
  aliases?: string[];
  /** Clave del contador contextual (badges del menú). */
  badge?: NavBadgeKey;
  children?: NavChild[];
}

export const NAV: NavEntry[] = [
  { key: 'dashboard', to: '/', label: 'Dashboard Gerencial', icon: LayoutDashboard, permission: 'DASHBOARD.VIEW', group: 'operacion' },
  {
    key: 'solicitudes', to: '/solicitudes', label: 'Mis solicitudes', icon: FileText, permission: 'REQUEST.VIEW',
    group: 'operacion', aliases: ['/requester'],
    children: [{ key: 'new', to: '/requester/new', label: 'Crear solicitud', permission: 'REQUEST.CREATE', icon: FilePlus2 }],
  },
  { key: 'approvals', to: '/approvals', label: 'Aprobaciones', icon: ClipboardCheck, permission: 'MANAGER.APPROVE', group: 'trabajo', badge: 'approvals' },
  { key: 'warehouse', to: '/warehouse', label: 'Almacén', icon: Warehouse, permission: 'WAREHOUSE.VIEW', group: 'trabajo', badge: 'warehouse' },
  // 15A — cola del Encargado de Almacén (permiso propio, no duplica Almacén).
  { key: 'warehouse-approval', to: '/aprobacion-almacen', label: 'Aprobación Almacén', icon: PackageCheck, permission: 'WAREHOUSE_MANAGER.VIEW', group: 'trabajo', badge: 'warehouseApproval' },
  { key: 'accounting', to: '/accounting', label: 'Contabilidad', icon: Calculator, permission: 'ACCOUNTING.VIEW', group: 'trabajo', badge: 'accounting' },
  { key: 'imports', to: '/imports', label: 'Importaciones', icon: Import, permission: 'IMPORT.VIEW', group: 'administracion' },
  {
    key: 'admin', label: 'Administración', icon: Settings, group: 'administracion',
    children: [
      { key: 'admin-personas', to: '/admin', label: 'Personas y acceso', permission: 'ADMIN.MANAGE', icon: UsersRound },
      { key: 'admin-organizacion', to: '/admin/organizacion', label: 'Organización', permission: 'ADMIN.MANAGE', icon: Building2 },
      { key: 'admin-roles', to: '/admin/roles', label: 'Roles y permisos', permission: 'ADMIN.MANAGE', icon: ShieldCheck },
      { key: 'admin-catalogos', to: '/admin/catalogos', label: 'Catálogos Profit', permission: 'ADMIN.MANAGE', icon: Database },
      { key: 'admin-empresas', to: '/admin/empresas', label: 'Empresas Profit', permission: 'ADMIN.MANAGE', icon: Factory },
      { key: 'admin-historico', to: '/admin/historico', label: 'Auditoría histórica', permission: 'ADMIN.MANAGE', icon: GitCompare },
      { key: 'audit', to: '/audit', label: 'Auditoría', permission: 'AUDIT.VIEW', icon: ScrollText },
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

/** ¿Tiene badge de contador contextual? (solo entradas de Trabajo visibles). */
export function navBadgeKey(entry: NavEntry | NavChild): NavBadgeKey | undefined {
  return entry.badge;
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
