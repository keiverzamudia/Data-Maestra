import { Module, forwardRef } from '@nestjs/common';
import { AutenticacionController } from './autenticacion.controller';
import { AutenticacionService } from './autenticacion.service';
import { ProfitModule } from '../profit/profit.module';

@Module({
  imports: [forwardRef(() => ProfitModule)],
  controllers: [AutenticacionController],
  providers: [AutenticacionService],
  exports: [AutenticacionService],
})
export class AutenticacionModule {}
