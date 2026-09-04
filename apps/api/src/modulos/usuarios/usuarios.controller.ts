import { Controller, Get, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UsuariosService } from './usuarios.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';

@ApiTags('Usuarios')
@Controller('usuarios')
@UseGuards(JwtGuard, RbacGuard)
export class UsuariosController {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly authService: AutenticacionService,
  ) {}

  @Post('sincronizar-profit')
  @HttpCode(HttpStatus.OK)
  // 10E: identidad real; autorización fina por empresa pendiente (10F).
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Synchronize users from Profit (READ-ONLY, idempotent)' })
  async sincronizarProfit(@CurrentUser() user: RequestUser) {
    const memberships = await this.authService.getMemberships(user.id);
    const actorCompanyId = memberships.length === 1 ? memberships[0]!.companyId : undefined;
    return this.usuariosService.synchronize(user.id, actorCompanyId);
  }

  @Get()
  // Protección temporal 10C (ver sincronizarProfit). 10D definirá el acceso
  // público necesario para la búsqueda del login.
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Search local users (never exposes passwordHash)' })
  @ApiQuery({ name: 'search', required: false, description: 'Filter by displayName' })
  @ApiQuery({ name: 'profitCode', required: false, description: 'Filter by profitCode (admin)' })
  async buscar(@Query('search') search?: string, @Query('profitCode') profitCode?: string) {
    return this.usuariosService.searchLocal(search, profitCode);
  }
}
