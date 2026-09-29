import { Module, forwardRef } from '@nestjs/common';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { ProfitAdapterService } from './profit-adapter.service';
import { ProfitWriteAdapterService } from './profit-write.adapter';
import { ProfitArticleCreationService } from './profit-article-creation.service';
import { CorporateCompaniesService } from './corporate-companies.service';
import { CorporateHomologationService } from './corporate-homologation.service';
import { MultiCompanyService } from './multi-company.service';
import { CatalogSyncService } from './catalog-sync.service';
import { ProfitController } from './profit.controller';
import { MultiCompanyController } from './multi-company.controller';
import { CatalogSyncController } from './catalog-sync.controller';

@Module({
  imports: [forwardRef(() => AutenticacionModule), AuditoriaModule],
  controllers: [ProfitController, MultiCompanyController, CatalogSyncController],
  providers: [
    ProfitAdapterService,
    ProfitWriteAdapterService,
    ProfitArticleCreationService,
    CorporateCompaniesService,
    CorporateHomologationService,
    MultiCompanyService,
    CatalogSyncService,
  ],
  exports: [
    ProfitAdapterService,
    ProfitWriteAdapterService,
    ProfitArticleCreationService,
    CorporateCompaniesService,
    CorporateHomologationService,
    MultiCompanyService,
    CatalogSyncService,
  ],
})
export class ProfitModule {}
