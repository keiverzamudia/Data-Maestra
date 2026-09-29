import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MultiCompanyAnalyzeDto {
  @ApiProperty({ example: 'uuid-de-solicitud' })
  @IsString({ message: 'El identificador de solicitud debe ser un texto.' })
  @IsNotEmpty({ message: 'El identificador de solicitud es requerido.' })
  requestId!: string;
}

export class MultiCompanyInsertDto {
  @ApiProperty({ example: 'uuid-de-solicitud' })
  @IsString({ message: 'El identificador de solicitud debe ser un texto.' })
  @IsNotEmpty({ message: 'El identificador de solicitud es requerido.' })
  requestId!: string;

  @ApiPropertyOptional({
    example: ['AD_TRANS', 'AD_ROMA'],
    description:
      'FASE 27 — Empresas que quedarán ACTIVAS. El artículo se crea en TODAS; las no listadas quedan INACTIVAS.',
  })
  @IsOptional()
  @IsArray({ message: 'Las empresas activas deben ser una lista.' })
  @IsString({ each: true, message: 'Cada empresa debe ser un texto.' })
  activeCompanies?: string[];
}
