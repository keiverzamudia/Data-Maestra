import { Module, forwardRef } from '@nestjs/common';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { ProfitAdapterService } from './profit-adapter.service';
import { ProfitWriteAdapterService } from './profit-write.adapter';
import { ProfitArticleCreationService } from './profit-article-creation.service';
import { CorporateCompaniesService } from './corporate-companies.service';
import { CorporateHomologationService } from './corporate-homologation.service';
import { ProfitController } from './profit.controller';
import { CorporateController } from './corporate.controller';

@Module({
  imports: [forwardRef(() => AutenticacionModule)],
  controllers: [ProfitController, CorporateController],
  providers: [
    ProfitAdapterService,
    ProfitWriteAdapterService,
    ProfitArticleCreationService,
    CorporateCompaniesService,
    CorporateHomologationService,
  ],
  exports: [
    ProfitAdapterService,
    ProfitWriteAdapterService,
    ProfitArticleCreationService,
    CorporateCompaniesService,
    CorporateHomologationService,
  ],
})
export class ProfitModule {}
