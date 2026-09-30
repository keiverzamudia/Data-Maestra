import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CatalogSyncService } from './catalog-sync.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';
import {
  AnalyzeCatalogsDto,
  ConfirmAllDto,
  ConfirmBulkDto,
  ConfirmProposalDto,
  DiscardProposalsDto,
  RejectProposalDto,
} from './dto/catalog-sync.dto';

/**
 * FASE 27 — MANEJO MULTIEMPRESA.
 *
 * Integra los catálogos del maestro (AD_TRANS) hacia las demás empresas de
 * `TEmpresas`, catálogo por catálogo para que nada quede desbordado.
 * Los conflictos de código (mismo código, otro significado) NUNCA se resuelven
 * solos: se proponen códigos nuevos (COM1…) y los confirma una persona.
 * Confirmar escribe en Profit (flag + PROFIT.WRITE) y queda auditado.
 */
@ApiTags('ManejoMultiempresa')
@Controller('profit/multiempresa')
@UseGuards(JwtGuard, RbacGuard)
export class CatalogSyncController {
  constructor(private readonly sync: CatalogSyncService) {}

  @Get('status')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Maestro + pendientes por empresa y catálogo (solo lectura)' })
  async status() {
    return {
      masterTotal: await this.sync.masterCount(),
      pending: await this.sync.proposalCounts(),
    };
  }

  @Get('master')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Catálogo maestro leído de AD_TRANS' })
  master(@Query('catalog') catalog?: string) {
    return this.sync.masterList(catalog);
  }

  @Post('master/sync')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Copia el catálogo de AD_TRANS al maestro local (solo lectura en Profit)' })
  syncMaster() {
    return this.sync.syncMaster();
  }

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Analiza por empresa y catálogo; devuelve contadores + una página de problemas' })
  analyze(@CurrentUser() user: RequestUser, @Body() dto: AnalyzeCatalogsDto) {
    return this.sync.analyze(user.id, {
      company: dto.company,
      catalog: dto.catalog,
      catalogs: dto.catalogs,
      includeProviders: dto.includeProviders,
      autoCreate: dto.autoCreate,
      limit: dto.limit,
      offset: dto.offset,
    });
  }

  @Get('proposals')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Propuestas de código por empresa y catálogo (solo lectura)' })
  proposals(@Query('company') company?: string, @Query('catalog') catalog?: string) {
    return this.sync.proposals(company, catalog);
  }

  @Post('proposals/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('PROFIT.WRITE')
  @ApiOperation({ summary: 'Confirma una propuesta: crea el elemento en la empresa y registra el vínculo' })
  confirm(@CurrentUser() user: RequestUser, @Body() dto: ConfirmProposalDto) {
    return this.sync.confirm(dto.id, dto.localCode, user.id);
  }

  @Post('proposals/confirm-bulk')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('PROFIT.WRITE')
  @ApiOperation({ summary: 'Confirma varias propuestas en bloque' })
  confirmBulk(@CurrentUser() user: RequestUser, @Body() dto: ConfirmBulkDto) {
    return this.sync.confirmBulk(dto.ids, dto.overrides ?? {}, user.id);
  }

  @Post('proposals/confirm-all')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('PROFIT.WRITE')
  @ApiOperation({ summary: 'Confirma las pendientes de una empresa (opcionalmente de un catálogo)' })
  confirmAll(@CurrentUser() user: RequestUser, @Body() dto: ConfirmAllDto) {
    return this.sync.confirmAll(dto.company.toUpperCase().trim(), dto.catalog, user.id);
  }

  @Post('proposals/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Rechaza una propuesta (queda registrada; no se crea nada en Profit)' })
  reject(@CurrentUser() user: RequestUser, @Body() dto: RejectProposalDto) {
    return this.sync.reject(dto.id, user.id, dto.note);
  }

  @Post('proposals/discard-catalogs')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Descarta las pendientes de catálogos fuera de alcance (por defecto proveedores y procedencias)' })
  discardCatalogs(@CurrentUser() user: RequestUser, @Body() dto: DiscardProposalsDto) {
    return this.sync.discardCatalogs(dto.catalogs, user.id);
  }
}
