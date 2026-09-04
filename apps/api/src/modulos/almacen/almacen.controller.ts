import { Controller, Get, Post, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AlmacenService } from './almacen.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';

@ApiTags('Warehouse')
@Controller('warehouse')
@UseGuards(JwtGuard, RbacGuard)
export class AlmacenController {
  constructor(
    private readonly warehouseService: AlmacenService,
    private readonly authService: AutenticacionService,
  ) {}

  @Get('pending')
  @RequirePermission('WAREHOUSE.VIEW')
  @ApiOperation({ summary: 'List requests pending warehouse classification' })
  findPending() {
    return this.warehouseService.findPendingClassification();
  }

  @Get(':id')
  @RequirePermission('WAREHOUSE.VIEW')
  @ApiOperation({ summary: 'Get request with classification data for editing' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  findOne(@Param('id') id: string) {
    return this.warehouseService.findOneForClassification(id);
  }

  @Post(':id/classify')
  @RequirePermission('WAREHOUSE.CLASSIFY')
  @ApiOperation({ summary: 'Save classification' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async classify(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.warehouseService.classify(id, body, user.id, companyId);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('WAREHOUSE.CLASSIFY')
  @ApiOperation({ summary: 'Approve classification (advances workflow)' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async approve(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.warehouseService.approve(id, user.id, companyId);
  }

  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('WAREHOUSE.CLASSIFY')
  @ApiOperation({ summary: 'Return request to requester' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async returnRequest(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body('comment') comment?: string) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.warehouseService.returnToRequester(id, comment, user.id, companyId);
  }
}
