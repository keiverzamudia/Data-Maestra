import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MultiCompanyService } from './multi-company.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';
import { MultiCompanyAnalyzeDto, MultiCompanyInsertDto } from './dto/multi-company.dto';

/**
 * FASE 25 — Analizador de compatibilidad e inserción multiempresa.
 * Análisis = solo lectura (DRY RUN). Inserción = PROFIT.WRITE + flag.
 * Configuración = ADMIN.MANAGE. profit-driver sigue siendo la única
 * capa de acceso a Profit.
 */
@ApiTags('MultiCompany')
@Controller('profit/multi-company')
@UseGuards(JwtGuard, RbacGuard)
export class MultiCompanyController {
  constructor(private readonly multi: MultiCompanyService) {}

  @Get('companies')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Empresas descubiertas (TEmpresas) con configuración local' })
  companies() {
    return this.multi.listCompanies();
  }

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Analiza compatibilidad por empresa (solo lectura, DRY RUN)' })
  analyze(@CurrentUser() user: RequestUser, @Body() dto: MultiCompanyAnalyzeDto) {
    return this.multi.analyze(dto.requestId, user.id);
  }

  @Post('insert')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('PROFIT.WRITE')
  @ApiOperation({ summary: 'Inserta en TODAS las empresas (activas por check; el resto inactivas)' })
  insert(@CurrentUser() user: RequestUser, @Body() dto: MultiCompanyInsertDto) {
    return this.multi.insertSelected(dto.requestId, dto.activeCompanies ?? [], { id: user.id, companyId: '' });
  }

  @Get('companies/:code')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Detalle de una empresa descubierta' })
  async company(@Param('code') code: string) {
    const list = await this.multi.listCompanies();
    return list.find((c) => c.code === String(code ?? '').trim().toUpperCase()) ?? null;
  }
}
