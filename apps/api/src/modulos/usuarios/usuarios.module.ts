import { Module } from '@nestjs/common';
import { PrismaModule } from '../../comun/prisma/prisma.module';
import { ProfitModule } from '../profit/profit.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { UsuariosController } from './usuarios.controller';
import { UsuariosService } from './usuarios.service';

@Module({
  imports: [PrismaModule, ProfitModule, AuditoriaModule, AutenticacionModule],
  controllers: [UsuariosController],
  providers: [UsuariosService],
  exports: [UsuariosService],
})
export class UsuariosModule {}
