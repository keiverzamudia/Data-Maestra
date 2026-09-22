import { Module, forwardRef } from '@nestjs/common';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { MantenimientoController } from './mantenimiento.controller';
import { MantenimientoService } from './mantenimiento.service';

@Module({
  imports: [forwardRef(() => AutenticacionModule), AuditoriaModule],
  controllers: [MantenimientoController],
  providers: [MantenimientoService],
  exports: [MantenimientoService],
})
export class MantenimientoModule {}
