import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AutenticacionService } from './autenticacion.service';
import { AUTH_COOKIE_NAME } from './auth.config';

/**
 * FASE 10E — Guard de identidad real.
 * Lee JWT de la cookie HttpOnly dm_session, valida firma/expiración,
 * valida Session (existe, vigente, no revocada) y User (existe, activo).
 * Coloca el usuario real en request.user. Sin esto: 401.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly authService: AutenticacionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = ctxRequest(context);
    const token: string | undefined = req.cookies?.[AUTH_COOKIE_NAME];
    if (!token) {
      throw new UnauthorizedException('Sesión requerida.');
    }
    const resolved = await this.authService.resolveSession(token);
    if (!resolved) {
      throw new UnauthorizedException('Sesión inválida o expirada.');
    }
    req.user = {
      id: resolved.user.id,
      displayName: resolved.user.displayName,
      sessionId: resolved.session.id,
      roleCodes: resolved.roleCodes,
      permissions: resolved.permissions,
    };
    return true;
  }
}

function ctxRequest(context: ExecutionContext) {
  return context.switchToHttp().getRequest();
}
