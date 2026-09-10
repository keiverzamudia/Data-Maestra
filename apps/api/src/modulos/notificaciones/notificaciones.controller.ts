import { Controller, Get, Patch, Param, Req, Sse, UseGuards, type MessageEvent } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { interval, merge, from, type Observable } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import type { Request as ExpressRequest } from 'express';
import { NotificacionesService } from './notificaciones.service';
import { SseService } from './sse.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';

@ApiTags('Notificaciones')
@Controller('notificaciones')
@UseGuards(JwtGuard, RbacGuard)
export class NotificacionesController {
  constructor(
    private readonly notificacionesService: NotificacionesService,
    private readonly sse: SseService,
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

  /**
   * 12F — Stream SSE del usuario autenticado (cookie dm_session existente).
   * userId siempre de sesión; nunca de query. Emite solo eventos propios.
   * Soporta Last-Event-ID: reenvía no leídas posteriores antes del vivo.
   */
  @Sse('stream')
  @ApiOperation({ summary: 'SSE stream of own notifications (authenticated, per-user)' })
  stream(@CurrentUser() user: RequestUser, @Req() req: ExpressRequest): Observable<MessageEvent> {
    const live$ = this.sse.streamFor(user.id).pipe(
      map(n => ({ id: n.id, type: 'notification', data: n }) as MessageEvent),
    );
    const ping$ = interval(25000).pipe(map(() => ({ type: 'ping', data: 'ping' }) as MessageEvent));
    const lastId = req.headers['last-event-id'];
    const lastEventId = Array.isArray(lastId) ? lastId[0] : lastId;
    if (!lastEventId) return merge(live$, ping$);
    const replay$ = from(this.notificacionesService.findUnreadSince(user.id, lastEventId)).pipe(
      mergeMap(rows => from(rows)),
      map(n => ({
        id: n.id,
        type: 'notification',
        data: {
          id: n.id,
          userId: n.userId,
          requestId: n.requestId,
          type: n.type,
          title: n.title,
          body: n.body,
          link: n.link,
          createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
        },
      }) as MessageEvent),
    );
    return merge(replay$, live$, ping$);
  }
}
