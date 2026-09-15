import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CatalogVisibilityService } from './catalog-visibility.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { RequirePermission } from '../autenticacion/require-permission.decorator';

/**
 * Catálogo efectivo Data-Maestra (FASE CAT): Profit × visibilidad.
 * Una sola fuente para selectores operativos (Almacén/Contabilidad).
 * La resolución de nombres históricos usa /catalogs/* sin filtrar.
 */
@ApiTags('EffectiveCatalogs')
@Controller('catalogs/effective')
@UseGuards(JwtGuard, RbacGuard)
export class CatalogEffectiveController {
  constructor(private readonly visibility: CatalogVisibilityService) {}

  @Get('groups')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Grupos efectivos (visibilidad aplicada)' })
  @ApiQuery({ name: 'companyId', required: false })
  async groups(@Query('companyId') companyId?: string) {
    return this.visibility.getEffective('GROUP', { companyId });
  }

  @Get('subgroups')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Subgrupos efectivos del grupo (visibilidad + padre aplicadas)' })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'groupCode', required: false })
  async subgroups(@Query('companyId') companyId?: string, @Query('groupCode') groupCode?: string) {
    return this.visibility.getEffective('SUBGROUP', { companyId, parentCode: groupCode });
  }

  @Get('categories')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Categorías efectivas' })
  @ApiQuery({ name: 'companyId', required: false })
  async categories(@Query('companyId') companyId?: string) {
    return this.visibility.getEffective('CATEGORY', { companyId });
  }

  @Get('brands')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Marcas efectivas' })
  @ApiQuery({ name: 'companyId', required: false })
  async brands(@Query('companyId') companyId?: string) {
    return this.visibility.getEffective('BRAND', { companyId });
  }

  @Get('units')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Unidades efectivas' })
  @ApiQuery({ name: 'companyId', required: false })
  async units(@Query('companyId') companyId?: string) {
    return this.visibility.getEffective('UNIT', { companyId });
  }

  @Get('tax-types')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Impuestos efectivos' })
  @ApiQuery({ name: 'companyId', required: false })
  async taxTypes(@Query('companyId') companyId?: string) {
    return this.visibility.getEffective('TAX', { companyId });
  }

  @Get('article-types')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Tipos de artículo efectivos' })
  @ApiQuery({ name: 'companyId', required: false })
  async articleTypes(@Query('companyId') companyId?: string) {
    return this.visibility.getEffective('ARTICLE_TYPE', { companyId });
  }
}
