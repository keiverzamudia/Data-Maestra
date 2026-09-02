import { Module } from '@nestjs/common';
import { PrismaModule } from '../../comun/prisma/prisma.module';
import { SolicitudesModule } from '../solicitudes/solicitud.module';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { AlmacenController } from './almacen.controller';
import { AlmacenService } from './almacen.service';

@Module({
  imports: [PrismaModule, SolicitudesModule, AutenticacionModule],
  controllers: [AlmacenController],
  providers: [AlmacenService],
  exports: [AlmacenService],
})
export class AlmacenModule {}
