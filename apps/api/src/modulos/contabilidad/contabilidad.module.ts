import { Module } from '@nestjs/common';
import { PrismaModule } from '../../comun/prisma/prisma.module';
import { SolicitudesModule } from '../solicitudes/solicitud.module';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { ProfitModule } from '../profit/profit.module';
import { ContabilidadController } from './contabilidad.controller';
import { ContabilidadService } from './contabilidad.service';

@Module({
  imports: [PrismaModule, SolicitudesModule, AutenticacionModule, ProfitModule],
  controllers: [ContabilidadController],
  providers: [ContabilidadService],
  exports: [ContabilidadService],
})
export class ContabilidadModule {}
