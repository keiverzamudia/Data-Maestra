import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator';
import type { RequestUser } from './current-user.decorator';

/**
 * FASE 10E — Autorización sobre identidad real.
 * Lee request.user (colocado por JwtGuard). Sin usuario → 401.
 * Permisos: puente temporal TODO(10F) — los conjuntos por rol siguen en
 * permisos.ts porque role_permissions está vacía. 10F los moverá a BD.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user as RequestUser | undefined;
    if (!user?.id) {
      throw new UnauthorizedException('Sesión requerida.');
    }

    const userPermissions = new Set(user.permissions ?? []);

    for (const permission of requiredPermissions) {
      if (!userPermissions.has(permission)) {
        throw new ForbiddenException(
          `No tienes permisos para realizar esta acción. Permiso requerido: ${permission}`,
        );
      }
    }

    return true;
  }
}
