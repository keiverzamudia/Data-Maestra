import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { HistoricalDuplicateService } from './application/historical-duplicate.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';
import { DetectDuplicatesDto, RelationQueryDto } from './dto/historical-duplicates.dto';

/**
 * FASE 23 — Detección histórica de posibles duplicados (solo lectura y
 * consulta). DETECCIÓN ≠ DECISIÓN: no hay SAME/DIFFERENT automático, no hay
 * fusión, no hay escritura Profit. Todo ADMIN.MANAGE.
 */
@ApiTags('HistoricalDuplicates')
@Controller('matching/historico/duplicados')
@UseGuards(JwtGuard, RbacGuard)
export class HistoricalDuplicatesController {
  constructor(private readonly detection: HistoricalDuplicateService) {}

  @Get('resumen')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Resumen del universo y la detección histórica' })
  resumen() {
    return this.detection.getResumen();
  }

  @Get('relaciones')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Tabla paginada de posibles duplicados' })
  @ApiQuery({ name: 'companyCode', required: false })
  @ApiQuery({ name: 'classification', required: false })
  @ApiQuery({ name: 'conConflictos', required: false })
  @ApiQuery({ name: 'coverage', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'code', required: false })
  @ApiQuery({ name: 'text', required: false })
  @ApiQuery({ name: 'orderBy', required: false })
  @ApiQuery({ name: 'orderDir', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  relaciones(
    @Query('companyCode') companyCode?: string,
    @Query('classification') classification?: string,
    @Query('conConflictos') conConflictos?: string,
    @Query('coverage') coverage?: string,
    @Query('status') status?: string,
    @Query('code') code?: string,
    @Query('text') text?: string,
    @Query('orderBy') orderBy?: string,
    @Query('orderDir') orderDir?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const allowed = ['25', '50', '100'];
    const dto: RelationQueryDto = { companyCode, code, text, status, coverage };
    if (['HIGH', 'MEDIUM', 'LOW', 'REVIEW'].includes(classification ?? '')) {
      dto.classification = classification as RelationQueryDto['classification'];
    }
    if (conConflictos === 'true') dto.conConflictos = true;
    if (conConflictos === 'false') dto.conConflictos = false;
    const by = (['score', 'classification', 'detectedAt', 'evidenceCount', 'conflictCount'] as const).includes(
      orderBy as never,
    )
      ? (orderBy as 'score' | 'classification' | 'detectedAt' | 'evidenceCount' | 'conflictCount')
      : 'score';
    return this.detection.listRelaciones(
      dto,
      page && /^\d+$/.test(page) ? parseInt(page, 10) : 1,
      allowed.includes(limit ?? '') ? parseInt(limit!, 10) : 25,
      { by, dir: orderDir === 'asc' ? 'asc' : 'desc' },
    );
  }

  @Get('grupos')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Grupos potenciales (cliques, pendientes de revisión)' })
  @ApiQuery({ name: 'companyCode', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  grupos(@Query('companyCode') companyCode?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    const allowed = ['25', '50', '100'];
    return this.detection.listGrupos(
      page && /^\d+$/.test(page) ? parseInt(page, 10) : 1,
      allowed.includes(limit ?? '') ? parseInt(limit!, 10) : 25,
      companyCode,
    );
  }

  @Get('articulos/:companyCode/:profitArticleCode')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Relaciones de un artículo histórico' })
  articulo(@Param('companyCode') companyCode: string, @Param('profitArticleCode') profitArticleCode: string) {
    return this.detection.getRelacionesDeArticulo(companyCode, profitArticleCode);
  }

  @Post('detectar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Ejecuta detección por lotes (idempotente, sin matching automático)' })
  detectar(@CurrentUser() user: RequestUser, @Body() dto: DetectDuplicatesDto) {
    return this.detection.detect({
      companyCode: dto.companyCode,
      batchSize: dto.batchSize,
      maxSeeds: dto.maxSeeds,
      maxBucketSize: dto.maxBucketSize,
      cursorCompanyCode: dto.cursorCompanyCode,
      cursorProfitCode: dto.cursorProfitCode,
      actorId: user.id,
    });
  }
}
