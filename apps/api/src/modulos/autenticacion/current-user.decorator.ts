import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface RequestUser {
  id: string;
  displayName: string;
  sessionId: string;
  roleCodes: string[];
  permissions: string[];
}

/**
 * FASE 10E — Única fuente de identidad backend.
 * Uso: currentUser(@CurrentUser() user: RequestUser).
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as RequestUser;
  },
);
