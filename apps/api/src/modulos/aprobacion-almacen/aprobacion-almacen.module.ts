import { Module } from '@nestjs/common';
import { PrismaModule } from '../../comun/prisma/prisma.module';
import { SolicitudesModule } from '../solicitudes/solicitud.module';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { AprobacionAlmacenController } from './aprobacion-almacen.controller';
import { AprobacionAlmacenService } from './aprobacion-almacen.service';

@Module({
  imports: [PrismaModule, SolicitudesModule, AutenticacionModule],
  controllers: [AprobacionAlmacenController],
  providers: [AprobacionAlmacenService],
  exports: [AprobacionAlmacenService],
})
export class AprobacionAlmacenModule {}
