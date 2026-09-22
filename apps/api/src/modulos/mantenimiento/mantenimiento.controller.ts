import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MantenimientoService } from './mantenimiento.service';
import { ResetTestDataDto } from './dto/reset-test-data.dto';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';

@ApiTags('Mantenimiento')
@Controller('maintenance')
@UseGuards(JwtGuard, RbacGuard)
export class MantenimientoController {
  constructor(
    private readonly mantenimientoService: MantenimientoService,
    private readonly authService: AutenticacionService,
  ) {}

  @Get('reset-preview')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Preview test-data reset counts (no changes)' })
  preview() {
    return this.mantenimientoService.preview();
  }

  @Post('reset-test-data')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Delete test orders/workflow/audit, keep Profit catalogs (gated by flag + typed confirmation)' })
  async reset(@Body() dto: ResetTestDataDto, @CurrentUser() user: RequestUser) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.mantenimientoService.resetTestData(dto.confirm, user.id, companyId);
  }
}
