import { Controller, Get, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UsuariosService } from './usuarios.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { RequirePermission } from '../autenticacion/require-permission.decorator';

@ApiTags('Usuarios')
@Controller('usuarios')
@UseGuards(RbacGuard)
export class UsuariosController {
  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly authService: AutenticacionService,
  ) {}

  @Post('sincronizar-profit')
  @HttpCode(HttpStatus.OK)
  // Protección temporal 10C: solo rol con ADMIN.MANAGE (hoy, MASTER_DATA_ADMIN
  // en memoria). 10E/10F la reemplazarán por autorización real contra BD.
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Synchronize users from Profit (READ-ONLY, idempotent)' })
  async sincronizarProfit() {
    const session = this.authService.getSession();
    return this.usuariosService.synchronize(session.id, session.company.id);
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
