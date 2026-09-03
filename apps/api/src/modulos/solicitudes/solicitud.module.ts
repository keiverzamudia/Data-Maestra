import { Module } from '@nestjs/common';
import { PrismaModule } from '../../comun/prisma/prisma.module';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { CatalogosModule } from '../catalogos/catalogos.module';
import { SolicitudesController } from './solicitud.controller';
import { SolicitudesService } from './solicitud.service';

@Module({
  imports: [PrismaModule, AutenticacionModule, CatalogosModule],
  controllers: [SolicitudesController],
  providers: [SolicitudesService],
  exports: [SolicitudesService],
})
export class SolicitudesModule {}
