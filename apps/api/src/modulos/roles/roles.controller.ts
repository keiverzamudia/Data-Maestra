import { Controller, Get, Post, Delete, Body, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';
import { RolePermissionDto } from './dto/role-permission.dto';

@ApiTags('Roles')
@Controller('roles')
@UseGuards(JwtGuard, RbacGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'List roles with user/permission counts' })
  async listar() {
    return this.rolesService.listRoles();
  }

  @Get(':code')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Role detail with permissions and users' })
  async detalle(@Param('code') code: string) {
    return this.rolesService.getRole(code);
  }

  @Post(':code/permisos')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Grant permission to role (idempotent)' })
  async conceder(@Param('code') code: string, @Body() dto: RolePermissionDto, @CurrentUser() user: RequestUser) {
    return this.rolesService.grantPermission(code, dto.permissionCode, user.id);
  }

  @Delete(':code/permisos')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Remove permission from role (safe, protects last admin)' })
  async quitar(@Param('code') code: string, @Body() dto: RolePermissionDto, @CurrentUser() user: RequestUser) {
    return this.rolesService.removePermission(code, dto.permissionCode, user.id);
  }
}
