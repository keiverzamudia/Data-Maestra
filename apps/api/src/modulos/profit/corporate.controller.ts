import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CorporateCompaniesService } from './corporate-companies.service';
import { CorporateHomologationService } from './corporate-homologation.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { CorporateCompaniesDto, CorporateRegisterArticleDto } from './dto/corporate.dto';

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
    return this.homologation.compare(body.companies);
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
    return this.homologation.homologate(body.companies, { userId: user.id, companyId });
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
}
