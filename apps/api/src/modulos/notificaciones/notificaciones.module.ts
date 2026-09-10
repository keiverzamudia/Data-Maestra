import { Module } from '@nestjs/common';
import { PrismaModule } from '../../comun/prisma/prisma.module';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';
import { SseService } from './sse.service';

@Module({
  imports: [PrismaModule, AutenticacionModule],
  controllers: [NotificacionesController],
  providers: [NotificacionesService, SseService],
  exports: [NotificacionesService, SseService],
})
export class NotificacionesModule {}
