import { Controller, Get, Post, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { ContabilidadService } from './contabilidad.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { RequirePermission } from '../autenticacion/require-permission.decorator';

@ApiTags('Accounting')
@Controller('accounting')
@UseGuards(RbacGuard)
export class ContabilidadController {
  constructor(
    private readonly accountingService: ContabilidadService,
    private readonly authService: AutenticacionService,
  ) {}

  @Get('pending')
  @RequirePermission('ACCOUNTING.VIEW')
  @ApiOperation({ summary: 'List requests pending accounting approval' })
  findPending() {
    return this.accountingService.findPendingApproval();
  }

  @Get(':id')
  @RequirePermission('ACCOUNTING.VIEW')
  @ApiOperation({ summary: 'Get request with classification and accounting data' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  findOne(@Param('id') id: string) {
    return this.accountingService.findOneForReview(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ACCOUNTING.APPROVE')
  @ApiOperation({ summary: 'Approve with accounting codes' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async approve(
    @Param('id') id: string,
    @Body() body: { accountingCodes?: Array<{ code: string; description: string; position?: string }> },
  ) {
    const session = this.authService.getSession();
    return this.accountingService.approve(id, body.accountingCodes ?? [], session.id, session.company.id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('ACCOUNTING.APPROVE')
  @ApiOperation({ summary: 'Reject with mandatory comment' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async reject(@Param('id') id: string, @Body() body: { comment?: string }) {
    const session = this.authService.getSession();
    return this.accountingService.reject(id, body.comment, session.id, session.company.id);
  }
}
