/**
 * 10G — Resolución de permisos efectivos compartida (backend).
 * Fuentes: permisos heredados de roles + overrides individuales del usuario.
 * Prioridad: DENEGADO > CONCEDIDO > HEREDADO.
 * Sin dependencias de NestJS para poder usarse en servicios y tests.
 */

export type PermissionSource = 'HEREDADO' | 'CONCEDIDO' | 'DENEGADO';

export interface EffectivePermissionDetail {
  code: string;
  source: PermissionSource;
  granted: boolean;
}

export interface EffectiveResolution {
  permissions: string[];
  detail: EffectivePermissionDetail[];
}

export function resolveEffectivePermissions(
  inherited: string[],
  overrides: Array<{ code: string; effect: string }>,
): EffectiveResolution {
  const denied = new Set(
    overrides.filter(o => o.effect === 'DENY').map(o => o.code),
  );
  const granted = new Set(
    overrides.filter(o => o.effect === 'GRANT').map(o => o.code),
  );
  const overrideCodes = new Set(overrides.map(o => o.code));
  const permissions = Array.from(new Set([...inherited, ...granted])).filter(
    p => !denied.has(p),
  );
  const detail = Array.from(new Set([...inherited, ...overrideCodes]))
    .sort()
    .map(code => {
      if (denied.has(code)) return { code, source: 'DENEGADO' as PermissionSource, granted: false };
      if (granted.has(code)) return { code, source: 'CONCEDIDO' as PermissionSource, granted: true };
      return { code, source: 'HEREDADO' as PermissionSource, granted: true };
    });
  return { permissions, detail };
}
