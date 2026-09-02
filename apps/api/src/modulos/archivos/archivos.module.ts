import { Module } from '@nestjs/common';
import { ArchivosController } from './archivos.controller';

@Module({
  controllers: [ArchivosController],
})
export class ArchivosModule {}
