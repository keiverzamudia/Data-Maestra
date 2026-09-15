import { Controller, Get, Put, Post, Param, Body, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { CatalogVisibilityService, CATALOG_TYPES } from './catalog-visibility.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';
import { CatalogModeDto, CatalogItemsDto } from './dto/catalog-visibility.dto';

/**
 * Administración de visibilidad de catálogos Profit (FASE CAT).
 * Solo ADMIN.MANAGE. Nunca escribe en Profit: solo configuración local
 * (qué se muestra/permite en Data-Maestra) + sincronización de lectura.
 */
@ApiTags('CatalogConfig')
@Controller('catalog-config')
@UseGuards(JwtGuard, RbacGuard)
export class CatalogConfigController {
  constructor(
    private readonly visibility: CatalogVisibilityService,
    private readonly authService: AutenticacionService,
  ) {}

  private async companyScope(user: RequestUser, companyId?: string): Promise<string> {
    if (!companyId) return '';
    // Valida pertenencia; el backend es la autoridad (nunca el cliente solo).
    return this.authService.resolveCompanyContext(user.id, companyId);
  }

  @Get(':type')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Vista administrativa del catálogo (todos, con banderas, búsqueda, paginación)' })
  @ApiParam({ name: 'type', description: `Tipo: ${CATALOG_TYPES.join(' | ')}` })
  async vista(
    @Param('type') type: string,
    @Query('companyId') companyId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.visibility.getAdminView(type, {
      companyId,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Put(':type/mode')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Cambiar modo de visibilidad ALL | SELECTED (audita)' })
  @ApiParam({ name: 'type', description: `Tipo: ${CATALOG_TYPES.join(' | ')}` })
  async modo(@CurrentUser() user: RequestUser, @Param('type') type: string, @Body() dto: CatalogModeDto) {
    const scope = await this.companyScope(user, dto.companyId);
    const companyId = await this.authService.resolveCompanyContext(user.id).catch(() => undefined);
    return this.visibility.setMode(type.toUpperCase(), dto.mode, {
      companyId: scope || undefined,
      actorId: user.id,
      actorCompanyId: companyId,
    });
  }

  @Put(':type/items')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Habilitar/deshabilitar elementos (audita)' })
  @ApiParam({ name: 'type', description: `Tipo: ${CATALOG_TYPES.join(' | ')}` })
  async items(@CurrentUser() user: RequestUser, @Param('type') type: string, @Body() dto: CatalogItemsDto) {
    const scope = await this.companyScope(user, dto.companyId);
    const companyId = await this.authService.resolveCompanyContext(user.id).catch(() => undefined);
    return this.visibility.setItemsVisible(type.toUpperCase(), dto.codes, dto.visible, {
      companyId: scope || undefined,
      actorId: user.id,
      actorCompanyId: companyId,
    });
  }

  @Post(':type/sync')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Sincronizar snapshot con Profit (solo lectura Profit, audita)' })
  @ApiParam({ name: 'type', description: `Tipo: ${CATALOG_TYPES.join(' | ')}` })
  async sincronizar(@CurrentUser() user: RequestUser, @Param('type') type: string) {
    const companyId = await this.authService.resolveCompanyContext(user.id).catch(() => undefined);
    return this.visibility.syncCatalog(type.toUpperCase(), { actorId: user.id, actorCompanyId: companyId });
  }
}
