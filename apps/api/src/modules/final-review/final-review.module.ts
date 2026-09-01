import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { RequestsModule } from '../requests/requests.module';
import { AuthModule } from '../auth/auth.module';
import { FinalReviewController } from './final-review.controller';
import { FinalReviewService } from './final-review.service';

@Module({
  imports: [PrismaModule, RequestsModule, AuthModule],
  controllers: [FinalReviewController],
  providers: [FinalReviewService],
  exports: [FinalReviewService],
})
export class FinalReviewModule {}
