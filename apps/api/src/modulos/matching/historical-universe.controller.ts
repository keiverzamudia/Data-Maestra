import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { HistoricalUniverseService } from './application/historical-universe.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';
import { HistoricalQueryDto, IngestCompanyDto } from './dto/historical-universe.dto';

/**
 * FASE 22 — Universo histórico (diagnóstico/administración).
 * Solo lectura en Profit + derivados locales. Sin matching histórico,
 * sin homologación, sin escritura Profit. Todo ADMIN.MANAGE.
 */
@ApiTags('HistoricalUniverse')
@Controller('matching/historico')
@UseGuards(JwtGuard, RbacGuard)
export class HistoricalUniverseController {
  constructor(private readonly universe: HistoricalUniverseService) {}

  @Get('resumen')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Métricas del universo histórico preparado' })
  resumen() {
    return this.universe.getMetrics();
  }

  @Get('articulos')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Consulta paginada del universo histórico' })
  @ApiQuery({ name: 'companyCode', required: false })
  @ApiQuery({ name: 'code', required: false })
  @ApiQuery({ name: 'text', required: false })
  @ApiQuery({ name: 'coverage', required: false })
  @ApiQuery({ name: 'hasTechnical', required: false })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (min 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (25, 50 or 100)' })
  articulos(
    @Query('companyCode') companyCode?: string,
    @Query('code') code?: string,
    @Query('text') text?: string,
    @Query('coverage') coverage?: string,
    @Query('hasTechnical') hasTechnical?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const allowed = ['25', '50', '100'];
    const parsedLimit = allowed.includes(limit ?? '') ? parseInt(limit!, 10) : 25;
    const parsedPage = page && /^\d+$/.test(page) ? parseInt(page, 10) : 1;
    const dto: HistoricalQueryDto = { companyCode, code, text };
    if (['INSUFICIENTE', 'BASICA', 'COMPARABLE', 'RICA'].includes(coverage ?? '')) {
      dto.coverage = coverage as HistoricalQueryDto['coverage'];
    }
    if (hasTechnical === 'true') dto.hasTechnical = true;
    return this.universe.listHistorical(dto, parsedPage, parsedLimit);
  }

  @Post('ingerir')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Ingiere un lote acotado del universo (idempotente, sin matching)' })
  ingerir(@CurrentUser() user: RequestUser, @Body() dto: IngestCompanyDto) {
    return this.universe.ingestCompany(dto.companyCode, {
      batchSize: dto.batchSize,
      maxBatches: dto.maxBatches,
      startOffset: dto.startOffset,
      actorId: user.id,
    });
  }
}
