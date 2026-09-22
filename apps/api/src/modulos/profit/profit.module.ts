import { Module, forwardRef } from '@nestjs/common';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ProfitAdapterService } from './profit-adapter.service';
import { ProfitWriteAdapterService } from './profit-write.adapter';
import { ProfitArticleCreationService } from './profit-article-creation.service';
import { CorporateCompaniesService } from './corporate-companies.service';
import { CorporateHomologationService } from './corporate-homologation.service';
import { MultiCompanyService } from './multi-company.service';
import { ProfitController } from './profit.controller';
import { CorporateController } from './corporate.controller';
import { MultiCompanyController } from './multi-company.controller';

@Module({
  imports: [forwardRef(() => AutenticacionModule), AuditoriaModule],
  controllers: [ProfitController, CorporateController, MultiCompanyController],
  providers: [
    ProfitAdapterService,
    ProfitWriteAdapterService,
    ProfitArticleCreationService,
    CorporateCompaniesService,
    CorporateHomologationService,
    MultiCompanyService,
  ],
  exports: [
    ProfitAdapterService,
    ProfitWriteAdapterService,
    ProfitArticleCreationService,
    CorporateCompaniesService,
    CorporateHomologationService,
    MultiCompanyService,
  ],
})
export class ProfitModule {}
