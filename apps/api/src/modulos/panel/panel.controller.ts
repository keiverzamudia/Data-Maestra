import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PanelService } from './panel.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { RequirePermission } from '../autenticacion/require-permission.decorator';

@ApiTags('Panel')
@Controller('panel')
@UseGuards(RbacGuard)
export class PanelController {
  constructor(private readonly panelService: PanelService) {}

  @Get('stats')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Get dashboard statistics' })
  @ApiQuery({ name: 'companyId', required: false })
  getStats(@Query('companyId') companyId?: string) {
    return this.panelService.getStats(companyId);
  }

  @Get('activity')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Get recent activity' })
  @ApiQuery({ name: 'companyId', required: false })
  getActivity(@Query('companyId') companyId?: string) {
    return this.panelService.getRecentActivity(companyId);
  }
}
