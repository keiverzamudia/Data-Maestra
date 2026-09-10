import { Module } from '@nestjs/common';
import { PrismaModule } from '../../comun/prisma/prisma.module';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { OrganizacionController } from './organizacion.controller';
import { OrganizacionService } from './organizacion.service';

@Module({
  imports: [PrismaModule, AutenticacionModule, AuditoriaModule],
  controllers: [OrganizacionController],
  providers: [OrganizacionService],
  exports: [OrganizacionService],
})
export class OrganizacionModule {}
