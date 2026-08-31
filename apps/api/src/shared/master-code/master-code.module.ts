import { Module } from '@nestjs/common';
import { MasterCodeService } from './master-code.service';

@Module({
  providers: [MasterCodeService],
  exports: [MasterCodeService],
})
export class MasterCodeModule {}
