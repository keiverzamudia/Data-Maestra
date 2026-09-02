import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { NotificacionesService } from './notificaciones.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { RbacGuard } from '../autenticacion/rbac.guard';

@ApiTags('Notificaciones')
@Controller('notificaciones')
@UseGuards(RbacGuard)
export class NotificacionesController {
  constructor(
    private readonly notificacionesService: NotificacionesService,
    private readonly authService: AutenticacionService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications for current user' })
  findMyNotifications() {
    const session = this.authService.getSession();
    return this.notificacionesService.findByUser(session.id);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount() {
    const session = this.authService.getSession();
    const count = await this.notificacionesService.countUnread(session.id);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markAsRead(@Param('id') id: string) {
    const session = this.authService.getSession();
    return this.notificacionesService.markAsRead(id, session.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllAsRead() {
    const session = this.authService.getSession();
    return this.notificacionesService.markAllAsRead(session.id);
  }
}
