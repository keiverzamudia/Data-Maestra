import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AutenticacionModule } from '../autenticacion/autenticacion.module';
import { ProfitModule } from '../profit/profit.module';
import { MatchingController } from './matching.controller';
import { HistoricalUniverseController } from './historical-universe.controller';
import { HistoricalDuplicatesController } from './historical-duplicates.controller';
import { MatchingService } from './application/matching.service';
import { HistoricalUniverseService } from './application/historical-universe.service';
import { HistoricalDuplicateService } from './application/historical-duplicate.service';
import { MatchingRepository } from './infrastructure/matching.repository';

/**
 * FASE 18 — Dominio de identidad/normalización para el futuro motor de
 * coincidencia. Reutiliza ProfitAdapter (lectura), CorporateCompaniesService
 * (catálogo TEmpresas), AuditoriaService y PrismaService. No expone
 * escritura Profit ni homologación.
 */
@Module({
  imports: [AuditoriaModule, AutenticacionModule, ProfitModule],
  controllers: [MatchingController, HistoricalUniverseController, HistoricalDuplicatesController],
  providers: [MatchingService, HistoricalUniverseService, HistoricalDuplicateService, MatchingRepository],
  exports: [MatchingService, HistoricalUniverseService, HistoricalDuplicateService],
})
export class MatchingModule {}
