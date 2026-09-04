import { Controller, Get, Post, Body, Query, Req, Res, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AutenticacionService } from './autenticacion.service';
import { LoginDto } from './dto/login.dto';
import { CambiarPasswordDto } from './dto/cambiar-password.dto';
import { JwtGuard } from './jwt.guard';
import { CurrentUser, RequestUser } from './current-user.decorator';
import { AUTH_COOKIE_NAME, getSessionTtlHours } from './auth.config';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: getSessionTtlHours() * 3600 * 1000,
  };
}

@ApiTags('Auth')
@Controller('auth')
export class AutenticacionController {
  constructor(private readonly authService: AutenticacionService) {}

  // FASE 10E: credenciales reales + Session + JWT en cookie HttpOnly.
  // No se devuelve accessToken al frontend (corrección #6).
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate, create Session and set HttpOnly cookie' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.loginReal(dto, req.ip, req.headers['user-agent']);
    res.cookie(AUTH_COOKIE_NAME, result.token, cookieOptions());
    return {
      authenticated: result.authenticated,
      user: result.user,
      mustChangePassword: result.mustChangePassword,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke current Session (idempotent)' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const resolved = await this.authService.resolveSession(req.cookies?.[AUTH_COOKIE_NAME]);
    if (resolved) {
      await this.authService.logout(resolved.session.id, resolved.user.id);
    }
    res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  // FASE 10E (corrección #7): identidad solo desde JWT/Session. Sin ?userId.
  @Get('session')
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Current session user (from JWT + Session)' })
  async session(@Req() req: Request) {
    // Revalida contra BD (no confía solo en el guard).
    const resolved = await this.authService.resolveSession(req.cookies?.[AUTH_COOKIE_NAME]);
    // JwtGuard ya garantizó sesión válida; esto es defensa en profundidad.
    if (!resolved) {
      return { authenticated: false };
    }
    return {
      authenticated: true,
      user: { id: resolved.user.id, displayName: resolved.user.displayName, active: resolved.user.active },
      mustChangePassword: resolved.user.mustChangePassword,
      roleCodes: resolved.roleCodes,
      permissions: resolved.permissions,
      memberships: resolved.memberships,
      sessionId: resolved.session.id,
    };
  }

  // FASE 10E (corrección #11): identidad desde sesión, body sin userId.
  @Post('cambiar-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  @ApiOperation({ summary: 'Change password for the authenticated user (revokes sessions)' })
  async cambiarPassword(@CurrentUser() user: RequestUser, @Body() dto: CambiarPasswordDto) {
    return this.authService.cambiarPasswordSesion(user.id, dto);
  }

  @Get('usuarios')
  @ApiOperation({ summary: 'Active users for login autocomplete (id + displayName only)' })
  @ApiQuery({ name: 'search', required: false })
  async usuariosLogin(@Query('search') search?: string) {
    return this.authService.listarUsuariosLogin(search);
  }
}
