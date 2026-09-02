import { Module } from '@nestjs/common';
import { PrismaModule } from '../../comun/prisma/prisma.module';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { ImportacionesController } from './importaciones.controller';
import { ImportacionesService } from './importaciones.service';

@Module({
  imports: [PrismaModule, AutenticacionModule],
  controllers: [ImportacionesController],
  providers: [ImportacionesService],
  exports: [ImportacionesService],
})
export class ImportacionesModule {}
