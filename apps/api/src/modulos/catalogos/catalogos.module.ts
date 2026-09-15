import { Module } from '@nestjs/common';
import { PrismaModule } from '../../comun/prisma/prisma.module';
import { ProfitModule } from '../profit/profit.module';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { CatalogosController } from './catalogos.controller';
import { CatalogEffectiveController } from './catalog-effective.controller';
import { CatalogConfigController } from './catalog-config.controller';
import { CatalogosService } from './catalogos.service';
import { CatalogVisibilityService } from './catalog-visibility.service';
import { CatalogImportService } from './catalog-import.service';

@Module({
  imports: [PrismaModule, ProfitModule, AutenticacionModule],
  controllers: [CatalogosController, CatalogEffectiveController, CatalogConfigController],
  providers: [CatalogosService, CatalogVisibilityService, CatalogImportService],
  exports: [CatalogosService, CatalogVisibilityService, CatalogImportService],
})
export class CatalogosModule {}
