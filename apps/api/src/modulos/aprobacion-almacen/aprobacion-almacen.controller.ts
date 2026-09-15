import { Controller, Get, Post, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AprobacionAlmacenService } from './aprobacion-almacen.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';

/**
 * FASE 15A — Cola y decisiones del Encargado de Almacén.
 * El backend es la autoridad final: guards por permiso efectivo + validación
 * de estado (ALMACEN_APROBADO) y empresa en el servicio. Sin endpoints
 * duplicados de negocio: las transiciones las ejecuta SolicitudesService.
 */
@ApiTags('WarehouseApproval')
@Controller('warehouse-approval')
@UseGuards(JwtGuard, RbacGuard)
export class AprobacionAlmacenController {
  constructor(
    private readonly approvalService: AprobacionAlmacenService,
    private readonly authService: AutenticacionService,
  ) {}

  @Get('pending')
  @RequirePermission('WAREHOUSE_MANAGER.VIEW')
  @ApiOperation({ summary: 'List requests pending warehouse-manager approval' })
  async findPending(@CurrentUser() user: RequestUser) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.approvalService.findPendingApproval(companyId);
  }

  @Get(':id')
  @RequirePermission('WAREHOUSE_MANAGER.VIEW')
  @ApiOperation({ summary: 'Get request with classification data for review' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.approvalService.findOneForApproval(id, companyId);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('WAREHOUSE_MANAGER.APPROVE')
  @ApiOperation({ summary: 'Approve classification (ALMACEN_APROBADO → PENDIENTE_CONTABILIDAD)' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async approve(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.approvalService.approve(id, user.id, companyId);
  }

  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('WAREHOUSE_MANAGER.APPROVE')
  @ApiOperation({ summary: 'Return request with mandatory comment' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async returnRequest(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body('comment') comment?: string,
  ) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.approvalService.returnRequest(id, comment, user.id, companyId);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('WAREHOUSE_MANAGER.APPROVE')
  @ApiOperation({ summary: 'Reject request with mandatory comment' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async reject(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body('comment') comment?: string,
  ) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.approvalService.reject(id, comment, user.id, companyId);
  }
}
