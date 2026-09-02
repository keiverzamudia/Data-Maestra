import { Module } from '@nestjs/common';
import { PrismaModule } from '../../comun/prisma/prisma.module';
import { CatalogosController } from './catalogos.controller';
import { CatalogosService } from './catalogos.service';
import { CatalogImportService } from './catalog-import.service';

@Module({
  imports: [PrismaModule],
  controllers: [CatalogosController],
  providers: [CatalogosService, CatalogImportService],
  exports: [CatalogosService, CatalogImportService],
})
export class CatalogosModule {}
