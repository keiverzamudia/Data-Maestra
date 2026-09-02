import { Module } from '@nestjs/common';
import { PrismaModule } from '../../comun/prisma/prisma.module';
import { SolicitudesModule } from '../solicitudes/solicitud.module';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { RevisionFinalController } from './revision-final.controller';
import { RevisionFinalService } from './revision-final.service';

@Module({
  imports: [PrismaModule, SolicitudesModule, AutenticacionModule],
  controllers: [RevisionFinalController],
  providers: [RevisionFinalService],
  exports: [RevisionFinalService],
})
export class RevisionFinalModule {}
