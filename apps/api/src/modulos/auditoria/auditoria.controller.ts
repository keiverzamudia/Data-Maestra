import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AuditoriaService } from './auditoria.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { RequirePermission } from '../autenticacion/require-permission.decorator';

@ApiTags('Audit')
@Controller('audit')
@UseGuards(RbacGuard)
export class AuditoriaController {
  constructor(private readonly auditService: AuditoriaService) {}

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
