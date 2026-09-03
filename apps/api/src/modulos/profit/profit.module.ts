import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { ProfitAdapterService } from './profit-adapter.service';
import { ProfitController } from './profit.controller';

@Module({
  imports: [AutenticacionModule],
  controllers: [ProfitController],
  providers: [ProfitAdapterService],
  exports: [ProfitAdapterService],
})
export class ProfitModule {}
