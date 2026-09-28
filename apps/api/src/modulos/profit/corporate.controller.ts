import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CorporateCompaniesService } from './corporate-companies.service';
import { CorporateHomologationService } from './corporate-homologation.service';
import { CorporateEquivalenceService } from './corporate-equivalence.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import {
  CorporateCompaniesDto,
  CorporateRegisterArticleDto,
  EquivalenceIdDto,
  EquivalenceSuggestDto,
  EquivalenceUpsertDto,
} from './dto/corporate.dto';

/**
 * FASE 17 — Homologación corporativa multiempresa.
 * Controller delgado: valida DTO + permisos y delega al servicio.
 * Lectura (empresas/comparar/preflight) con DASHBOARD.VIEW; cualquier
 * escritura corporativa exige PROFIT.WRITE (deny by default, igual que el
 * registro simple). El flag PROFIT_WRITE_ENABLED gobierna el motor.
 */
@ApiTags('Corporate')
@Controller('corporate')
@UseGuards(JwtGuard, RbacGuard)
export class CorporateController {
  constructor(
    private readonly companiesService: CorporateCompaniesService,
    private readonly homologation: CorporateHomologationService,
    private readonly authService: AutenticacionService,
    private readonly equivalences: CorporateEquivalenceService,
  ) {}

  @Get('companies')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Empresas desde AD_GRUP.dbo.TEmpresas con marca de estándar (solo lectura)' })
  getCompanies() {
    return this.companiesService.listCompanies();
  }

  @Post('compare')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Comparar catálogos AD_TRANS vs destinos (solo lectura, sin escrituras)' })
  compare(@Body() body: CorporateCompaniesDto) {
    return this.homologation.compare(body.companies, { catalogs: body.catalogs });
  }

  @Post('preflight')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Preflight global de catálogos (solo lectura, todo-o-nada)' })
  preflight(@Body() body: CorporateCompaniesDto) {
    return this.homologation.preflight(body.companies);
  }

  @Post('homologate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('PROFIT.WRITE')
  @ApiOperation({ summary: 'Homologar catálogos en destinos (transacción global, cero escrituras parciales)' })
  async homologate(@CurrentUser() user: RequestUser, @Body() body: CorporateCompaniesDto) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.homologation.homologate(body.companies, { userId: user.id, companyId }, {
      catalogs: body.catalogs,
      items: body.items,
    });
  }

  @Post('register-article')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('PROFIT.WRITE')
  @ApiOperation({ summary: 'Registrar el mismo artículo en estándar + destinos (correlativo universal, verificado)' })
  async registerArticle(@CurrentUser() user: RequestUser, @Body() body: CorporateRegisterArticleDto) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.homologation.registerArticle(body.companies, body.article, {
      userId: user.id,
      companyId,
      requestId: body.requestId,
    });
  }

  // ------------------------------------------------ FASE 26 — equivalencias

  @Get('equivalences')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Equivalencias de catálogo registradas (AD_TRANS ↔ código local por empresa)' })
  listEquivalences(@Query('company') company?: string) {
    return this.equivalences.list(company);
  }

  @Post('equivalences/suggest')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Sugerencias por descripción idéntica (solo lectura, nunca se aplican solas)' })
  suggestEquivalences(@Body() dto: EquivalenceSuggestDto) {
    return this.equivalences.suggest(dto.company);
  }

  @Post('equivalences')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Crea o actualiza una equivalencia explícita y auditable' })
  upsertEquivalence(@CurrentUser() user: RequestUser, @Body() dto: EquivalenceUpsertDto) {
    return this.equivalences.upsert(dto, user.id);
  }

  @Post('equivalences/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Desactiva una equivalencia (borrado lógico, sin pérdida de historial)' })
  deactivateEquivalence(@CurrentUser() user: RequestUser, @Body() dto: EquivalenceIdDto) {
    return this.equivalences.deactivate(dto.id, user.id);
  }

  @Get('sync-state')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Última sincronización de catálogos por empresa (solo lectura local)' })
  syncState(@Query('company') company?: string) {
    return this.homologation.syncState(company);
  }
}
