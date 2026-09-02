import { Module } from '@nestjs/common';
import { ProfitAdapterService } from './profit-adapter.service';
import { ProfitController } from './profit.controller';

@Module({
  controllers: [ProfitController],
  providers: [ProfitAdapterService],
  exports: [ProfitAdapterService],
})
export class ProfitModule {}
