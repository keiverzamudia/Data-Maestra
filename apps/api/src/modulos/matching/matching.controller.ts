import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MatchingService } from './application/matching.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';
import { NormalizeArticleDto, UpsertProfileDto, RegisterDecisionDto, CandidatesForRequestDto, LinkRequestDto, AnalyzeDraftDto } from './dto/matching.dto';

/**
 * FASE 18 — Endpoints base del dominio matching (controller delgado).
 * Solo lectura en Profit + escritura local (perfiles, decisiones). Sin
 * homologación, sin registro de artículos, sin escritura Profit.
 */
@ApiTags('Matching')
@Controller('matching')
@UseGuards(JwtGuard, RbacGuard)
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Post('normalizar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'Normaliza un input libre con v2 + señales (puro salvo catálogo de marcas)' })
  normalizar(@Body() dto: NormalizeArticleDto) {
    return this.matching.normalizeV2({
      companyCode: '',
      description: dto.description,
      purpose: dto.purpose,
      brand: dto.brand,
      model: dto.model,
      partNumber: dto.partNumber,
      category: dto.category,
      subCategory: dto.subCategory,
      unit: dto.unit,
      application: dto.application,
    });
  }

  @Post('perfiles')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'Obtiene o crea el perfil de normalización (lee Profit, persiste local)' })
  perfil(@Body() dto: UpsertProfileDto) {
    return this.matching.getOrCreateProfile(dto.companyCode, dto.profitArticleCode);
  }

  @Post('renormalizar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'Re-normaliza un perfil existente a v2 sin perder el original' })
  renormalizar(@Body() dto: UpsertProfileDto) {
    return this.matching.renormalizeProfile(dto.companyCode, dto.profitArticleCode);
  }

  @Post('decisiones')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('WAREHOUSE.CLASSIFY')
  @ApiOperation({ summary: 'Registra decisión humana SAME/DIFFERENT/REVIEW (solo registra)' })
  decision(@CurrentUser() user: RequestUser, @Body() dto: RegisterDecisionDto) {
    return this.matching.registerDecision(
      { companyCode: dto.articleACompany.trim().toUpperCase(), profitArticleCode: dto.articleAProfitCode.trim() },
      { companyCode: dto.articleBCompany.trim().toUpperCase(), profitArticleCode: dto.articleBProfitCode.trim() },
      dto.decision,
      dto.reason,
      user.id,
    );
  }

  @Post('candidatos')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'Candidatos del motor para una solicitud (asistencia, no decide)' })
  candidatos(@Body() dto: CandidatesForRequestDto) {
    return this.matching.findCandidatesForRequest(dto.requestId, dto.companyCode);
  }

  @Post('analizar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'Analizador de Almacén: solicitud + borrador contra universo AD_TRANS (asistencia, no decide)' })
  analizar(@Body() dto: AnalyzeDraftDto) {
    const { requestId, limit, companyCode, ...draft } = dto;
    return this.matching.analyzeDraft(requestId, draft, { universeCompanyCode: companyCode, limit });
  }

  @Post('solicitudes/:id/vincular')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('WAREHOUSE.CLASSIFY')
  @ApiOperation({ summary: 'Vincula la solicitud con un artículo existente (SAME/DIFFERENT, sin tocar Profit)' })
  vincular(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: LinkRequestDto,
  ) {
    return this.matching.linkRequestToExisting(id, dto.companyCode, dto.profitArticleCode, dto.decision, user.id);
  }
}
