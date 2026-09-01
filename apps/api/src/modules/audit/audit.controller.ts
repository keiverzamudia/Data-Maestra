import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermission } from '../auth/require-permission.decorator';

@ApiTags('Audit')
@Controller('audit')
@UseGuards(RbacGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('events')
  @RequirePermission('AUDIT.VIEW')
  @ApiOperation({ summary: 'List audit events with optional filters' })
  @ApiQuery({ name: 'entityType', required: false, description: 'Filter by entity type' })
  @ApiQuery({ name: 'entityId', required: false, description: 'Filter by entity ID' })
  @ApiQuery({ name: 'actorId', required: false, description: 'Filter by actor user ID' })
  findEvents(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorId') actorId?: string,
  ) {
    return this.auditService.findEvents({ entityType, entityId, actorId });
  }
}
