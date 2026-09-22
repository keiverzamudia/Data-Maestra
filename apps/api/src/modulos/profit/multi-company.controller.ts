import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MultiCompanyService } from './multi-company.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';
import {
  MultiCompanyAnalyzeDto,
  MultiCompanyInsertDto,
  CompanyConfigDto,
  StandardCompanyDto,
} from './dto/multi-company.dto';

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
  @ApiOperation({ summary: 'Inserta en las empresas seleccionadas (revalida cada una)' })
  insert(@CurrentUser() user: RequestUser, @Body() dto: MultiCompanyInsertDto) {
    return this.multi.insertSelected(dto.requestId, dto.companies, { id: user.id, companyId: '' });
  }

  @Post('companies/config')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Habilita/deshabilita una empresa para inserción (admin)' })
  saveConfig(@CurrentUser() user: RequestUser, @Body() dto: CompanyConfigDto) {
    return this.multi.saveCompanyConfig(dto.code, dto.enabled, user.id);
  }

  @Post('companies/standard')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Define la empresa estándar corporativa (admin)' })
  setStandard(@CurrentUser() user: RequestUser, @Body() dto: StandardCompanyDto) {
    if (dto.confirm !== true) {
      return { ok: false, message: 'Confirme el cambio de empresa estándar.' };
    }
    return this.multi.setStandardCompany(dto.code, user.id);
  }

  @Get('companies/:code')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Detalle de una empresa descubierta' })
  async company(@Param('code') code: string) {
    const list = await this.multi.listCompanies();
    return list.find((c) => c.code === String(code ?? '').trim().toUpperCase()) ?? null;
  }
}
