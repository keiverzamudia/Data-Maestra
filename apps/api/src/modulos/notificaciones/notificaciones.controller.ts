import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { NotificacionesService } from './notificaciones.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';

@ApiTags('Notificaciones')
@Controller('notificaciones')
@UseGuards(JwtGuard, RbacGuard)
export class NotificacionesController {
  constructor(
    private readonly notificacionesService: NotificacionesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications for current user' })
  findMyNotifications(@CurrentUser() user: RequestUser) {
    return this.notificacionesService.findByUser(user.id);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@CurrentUser() user: RequestUser) {
    const count = await this.notificacionesService.countUnread(user.id);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  markAsRead(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.notificacionesService.markAsRead(id, user.id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllAsRead(@CurrentUser() user: RequestUser) {
    return this.notificacionesService.markAllAsRead(user.id);
  }
}
