/**
 * FASE 18 §23 — Ruta inicial según vista principal del rol.
 * La vista nunca otorga permisos: sin permiso para la vista resuelta,
 * fallback seguro a Mis solicitudes. Pura y testeable.
 */
export interface ResolvedHomeView {
  route: string;
  permission: string;
}

export function resolveHomeRoute(
  view: ResolvedHomeView | null | undefined,
  hasPermission: (p: string) => boolean,
): string {
  if (view && view.route && hasPermission(view.permission)) return view.route;
  return '/solicitudes';
}
