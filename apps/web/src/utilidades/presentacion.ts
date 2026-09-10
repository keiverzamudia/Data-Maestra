/**
 * 12H — Catálogo centralizado de presentación en español.
 * Los códigos técnicos (roles, permisos, acciones) permanecen intactos como
 * identificadores internos (RBAC, BD, API, auditoría). Esta capa SOLO traduce
 * a lenguaje visible para el usuario final. Desconocidos → se devuelven tal cual.
 */

export interface RolePresentation {
  label: string;
  description: string;
}

const ROLES: Record<string, RolePresentation> = {
  MASTER_DATA_ADMIN: {
    label: 'Administrador Maestro de Datos',
    description: 'Administra usuarios, roles, permisos y configuración general del sistema.',
  },
  WAREHOUSE: {
    label: 'Almacén',
    description: 'Clasifica y valida la información del artículo antes de enviarlo a Contabilidad.',
  },
  ACCOUNTING: {
    label: 'Contabilidad',
    description: 'Valida la información contable y prepara la solicitud para continuar hacia Profit.',
  },
  DEPARTMENT_MANAGER: {
    label: 'Jefe de Departamento',
    description: 'Revisa y aprueba las solicitudes correspondientes a su departamento.',
  },
  FINAL_REVIEWER: {
    label: 'Validador Maestro',
    description: 'Realiza la validación maestra de la solicitud antes de la aprobación final.',
  },
  REQUESTER: {
    label: 'Solicitante',
    description: 'Usuario que crea y da seguimiento a una solicitud.',
  },
};

export function getRoleLabel(code: string, fallbackName?: string | null): string {
  return ROLES[code]?.label ?? fallbackName ?? code;
}

export function getRoleDescription(code: string): string | null {
  return ROLES[code]?.description ?? null;
}

export function getRolePresentation(code: string, fallbackName?: string | null): RolePresentation {
  const known = ROLES[code];
  if (known) return known;
  return { label: fallbackName ?? code, description: '' };
}

const PERMISSIONS: Record<string, string> = {
  'REQUEST.CREATE': 'Crear solicitudes',
  'REQUEST.VIEW': 'Consultar solicitudes',
  'WAREHOUSE.CLASSIFY': 'Clasificar artículos',
  'WAREHOUSE.VIEW': 'Consultar solicitudes de Almacén',
  'ACCOUNTING.APPROVE': 'Aprobar validación contable',
  'ACCOUNTING.VIEW': 'Consultar solicitudes de Contabilidad',
  'FINAL_REVIEW.APPROVE': 'Realizar validación maestra',
  'MANAGER.APPROVE': 'Aprobar solicitudes del departamento',
  'DASHBOARD.VIEW': 'Consultar panel principal',
  'ADMIN.MANAGE': 'Administrar configuración',
  'AUDIT.VIEW': 'Consultar auditoría',
  'IMPORT.RUN': 'Ejecutar importaciones',
  'IMPORT.VIEW': 'Consultar importaciones',
};

export function getPermissionLabel(code: string): string {
  return PERMISSIONS[code] ?? code;
}

const AUDIT_ACTIONS: Record<string, string> = {
  USER_ROLE_ASSIGNED: 'Rol asignado',
  USER_ROLE_REMOVED: 'Rol retirado',
  ROLE_ASSIGNED_BULK: 'Roles asignados masivamente',
  USER_PASSWORD_RESET: 'Contraseña restablecida',
  USER_ACTIVATED: 'Usuario activado',
  USER_DEACTIVATED: 'Usuario desactivado',
  USER_ORG_CHANGED: 'Organización actualizada',
  USER_PERMISSION_GRANTED: 'Permiso concedido',
  USER_PERMISSION_DENIED: 'Permiso denegado',
  USER_PERMISSION_RESET: 'Permisos restablecidos',
  ROLE_PERMISSION_GRANTED: 'Permiso concedido al rol',
  ROLE_PERMISSION_REMOVED: 'Permiso retirado del rol',
  DEPARTMENT_UPDATED: 'Departamento actualizado',
  PROFIT_USER_SYNC: 'Sincronización con Profit',
  PROFIT_USER_SYNC_FAILED: 'Fallo de sincronización con Profit',
  LOGIN_EXITOSO: 'Inicio de sesión',
  LOGIN_FALLIDO: 'Intento de acceso fallido',
  LOGOUT: 'Cierre de sesión',
  CAMBIO_PASSWORD: 'Contraseña actualizada',
  CAMBIO_PASSWORD_FALLIDO: 'Fallo al cambiar contraseña',
  SESSION_REVOCADA: 'Sesión cerrada',
  CREATED: 'Solicitud creada',
  SUBMIT: 'Solicitud enviada',
  SUBMITTED: 'Solicitud enviada',
  CLASSIFIED: 'Artículo clasificado',
  APPROVE: 'Aprobación',
  RETURN: 'Devolución',
  REJECT: 'Rechazo',
};

export function getAuditActionLabel(action: string): string {
  return AUDIT_ACTIONS[action] ?? action;
}
