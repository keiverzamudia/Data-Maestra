import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { ProfitAdapterService } from './profit-adapter.service';
import { ProfitWriteAdapterService } from './profit-write.adapter';
import { ProfitArticleCreationService } from './profit-article-creation.service';
import { ProfitController } from './profit.controller';

@Module({
  imports: [AutenticacionModule],
  controllers: [ProfitController],
  providers: [ProfitAdapterService, ProfitWriteAdapterService, ProfitArticleCreationService],
  exports: [ProfitAdapterService, ProfitWriteAdapterService, ProfitArticleCreationService],
})
export class ProfitModule {}
