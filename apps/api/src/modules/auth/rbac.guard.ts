import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const session = this.authService.getSession();
    const userPermissions = new Set(session.permissions);

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
