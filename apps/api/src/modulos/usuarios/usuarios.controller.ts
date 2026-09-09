import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { UsuariosService } from './usuarios.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';
import { SetActiveDto } from './dto/set-active.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { RemoveRoleDto } from './dto/remove-role.dto';
import { SetOverrideDto } from './dto/set-override.dto';
import { RemoveOverrideDto } from './dto/remove-override.dto';
import { AssignRoleBulkDto } from './dto/assign-role-bulk.dto';

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

  @Post('asignar-rol-masivo')
  @HttpCode(HttpStatus.OK)
  // 10J: asignación masiva transaccional (crea solo membresías faltantes).
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Bulk assign role to users (transactional, reports per-user status)' })
  async asignarRolMasivo(@Body() dto: AssignRoleBulkDto, @CurrentUser() user: RequestUser) {
    return this.usuariosService.assignRoleBulk(dto, user.id);
  }

  @Get()
  // Protección temporal 10C (ver sincronizarProfit). 10D definirá el acceso
  // público necesario para la búsqueda del login.
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Search local users (never exposes passwordHash)' })
  @ApiQuery({ name: 'search', required: false, description: 'Filter by displayName, username or profitCode (contains)' })
  @ApiQuery({ name: 'profitCode', required: false, description: 'Filter by profitCode exact (admin)' })
  async buscar(@Query('search') search?: string, @Query('profitCode') profitCode?: string) {
    return this.usuariosService.searchLocal(search, profitCode);
  }

  // =====================================================================
  // 10G/10H — Administración de usuarios (todo ADMIN.MANAGE).
  // =====================================================================

  @Get(':id')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'User detail with memberships and effective permissions (never exposes passwordHash)' })
  async detalle(@Param('id') id: string) {
    return this.usuariosService.getDetalle(id);
  }

  @Patch(':id/active')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Activate/deactivate user (never deletes)' })
  async cambiarEstado(@Param('id') id: string, @Body() dto: SetActiveDto, @CurrentUser() user: RequestUser) {
    return this.usuariosService.setActive(id, dto.active, user.id);
  }

  @Post(':id/roles')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Assign role with company/department' })
  async asignarRol(@Param('id') id: string, @Body() dto: AssignRoleDto, @CurrentUser() user: RequestUser) {
    return this.usuariosService.assignRole(id, dto, user.id);
  }

  @Delete(':id/roles')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Remove role membership (soft, keeps history)' })
  async quitarRol(@Param('id') id: string, @Body() dto: RemoveRoleDto, @CurrentUser() user: RequestUser) {
    return this.usuariosService.removeRole(id, dto, user.id);
  }

  @Post(':id/permisos')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Grant/deny individual permission override (never self)' })
  async fijarOverride(@Param('id') id: string, @Body() dto: SetOverrideDto, @CurrentUser() user: RequestUser) {
    return this.usuariosService.setOverride(id, dto, user.id);
  }

  @Delete(':id/permisos')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Remove individual override (back to inherited)' })
  async quitarOverride(@Param('id') id: string, @Body() dto: RemoveOverrideDto, @CurrentUser() user: RequestUser) {
    return this.usuariosService.removeOverride(id, dto.permissionCode, user.id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Reset to initial-password flow (revokes sessions, no secrets exposed)' })
  async restablecerPassword(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.usuariosService.resetPassword(id, user.id);
  }
}
