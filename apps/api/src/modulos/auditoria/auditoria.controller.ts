import { Controller, Get, Param, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AuditoriaService } from './auditoria.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { RequirePermission } from '../autenticacion/require-permission.decorator';

@ApiTags('Audit')
@Controller('audit')
@UseGuards(JwtGuard, RbacGuard)
export class AuditoriaController {
  constructor(private readonly auditService: AuditoriaService) {}

  @Get('events')
  @RequirePermission('AUDIT.VIEW')
  @ApiOperation({ summary: 'List audit events with filters and real backend pagination' })
  @ApiQuery({ name: 'entityType', required: false, description: 'Filter by entity type' })
  @ApiQuery({ name: 'entityId', required: false, description: 'Filter by entity ID (affected)' })
  @ApiQuery({ name: 'actorId', required: false, description: 'Filter by actor user ID' })
  @ApiQuery({ name: 'action', required: false, description: 'Filter by action/event' })
  @ApiQuery({ name: 'correlationId', required: false, description: 'Filter by correlation ID (bulk ops)' })
  @ApiQuery({ name: 'search', required: false, description: 'General search (action, entity, correlation)' })
  @ApiQuery({ name: 'from', required: false, description: 'From date (ISO)' })
  @ApiQuery({ name: 'to', required: false, description: 'To date (ISO)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page (default 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Limit 1-100 (default 20)' })
  findEvents(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('correlationId') correlationId?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    // Solo lectura: consultar auditoría nunca genera eventos (sin cascadas).
    return this.auditService.findEvents({
      entityType,
      entityId,
      actorId,
      action,
      correlationId,
      search,
      from,
      to,
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
    });
  }

  @Get('events/:id')
  @RequirePermission('AUDIT.VIEW')
  @ApiOperation({ summary: 'Audit event detail (safe projection, no secrets)' })
  async findEvent(@Param('id') id: string) {
    const row = await this.auditService.findEventById(id);
    if (!row) throw new NotFoundException('Evento no encontrado.');
    return row;
  }
}
