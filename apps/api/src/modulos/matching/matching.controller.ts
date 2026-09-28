import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MatchingService } from './application/matching.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';
import { NormalizeArticleDto, UpsertProfileDto, RegisterDecisionDto, CandidatesForRequestDto, LinkRequestDto, AnalyzeDraftDto, SearchArticleDto, ProposeManualHitDto, ListManualProposalsDto, UnproposeManualHitDto } from './dto/matching.dto';

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
  candidatos(@CurrentUser() user: RequestUser, @Body() dto: CandidatesForRequestDto) {
    return this.matching.findCandidatesForRequest(dto.requestId, dto.companyCode, user.id);
  }

  @Post('analizar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'Analizador de Almacén: solicitud + borrador contra el universo de su empresa (asistencia, no decide)' })
  analizar(@CurrentUser() user: RequestUser, @Body() dto: AnalyzeDraftDto) {
    const { requestId, limit, companyCode, phase, ...draft } = dto;
    return this.matching.analyzeDraft(requestId, draft, {
      universeCompanyCode: companyCode,
      limit,
      phase,
      actorId: user.id,
    });
  }

  /**
   * FASE P3 — Búsqueda manual de un artículo en Profit (escape hatch humano).
   * Solo consulta: universo local primero y Profit en vivo como respaldo.
   */
  @Post('buscar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'Busca manualmente un artículo en Profit por palabras (universo local, respaldo en Profit)' })
  buscar(@CurrentUser() user: RequestUser, @Body() dto: SearchArticleDto) {
    return this.matching.searchManualArticle(dto.requestId, dto.term, {
      limit: dto.limit,
      actorId: user.id,
    });
  }

  /**
   * FASE P4 — agrega un hallazgo de la búsqueda manual a las coincidencias
   * de la solicitud (propuesta persistida del usuario). Se puntúa con el
   * mismo motor; no decide SAME/DIFFERENT ni escribe en Profit.
   */
  @Post('proponer')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'Propone un hallazgo manual como coincidencia (lo puntúa el motor, no decide)' })
  proponer(@CurrentUser() user: RequestUser, @Body() dto: ProposeManualHitDto) {
    const { requestId, companyCode, profitArticleCode, phase, ...draft } = dto;
    return this.matching.proposeManualCandidate(requestId, companyCode, profitArticleCode, draft, {
      phase,
      actorId: user.id,
    });
  }

  /** FASE P4 — propuestas manuales guardadas, re-puntadas con el motor. */
  @Post('proponer/listar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'Propuestas manuales de la solicitud re-puntadas con el motor (solo lectura)' })
  listarPropuestas(@Body() dto: ListManualProposalsDto) {
    const { requestId, phase, ...draft } = dto;
    return this.matching.listManualProposals(requestId, draft, { phase });
  }

  /** FASE P4 — retira la propuesta; nunca borra decisiones SAME/DIFFERENT. */
  @Post('proponer/retirar')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'Retira una propuesta manual (solo la propuesta, no toca decisiones)' })
  retirarPropuesta(@CurrentUser() user: RequestUser, @Body() dto: UnproposeManualHitDto) {
    return this.matching.unproposeManualCandidate(
      dto.requestId,
      dto.companyCode,
      dto.profitArticleCode,
      user.id,
    );
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
