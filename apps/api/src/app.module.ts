import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'path';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { RequestsModule } from './modules/requests/requests.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { FinalReviewModule } from './modules/final-review/final-review.module';
import { AuditModule } from './modules/audit/audit.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { PrismaModule } from './shared/prisma/prisma.module';
import { WorkflowModule } from './shared/workflow/workflow.module';
import { MasterCodeModule } from './shared/master-code/master-code.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, '..', '.env.local'), join(__dirname, '..', '.env')],
    }),
    PrismaModule,
    HealthModule,
    CatalogsModule,
    AuthModule,
    RequestsModule,
    WarehouseModule,
    AccountingModule,
    FinalReviewModule,
    AuditModule,
    UploadsModule,
    WorkflowModule,
    MasterCodeModule,
  ],
})
export class AppModule {}
