import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, ArrayMinSize } from 'class-validator';
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

  @ApiProperty({ example: ['AD_TRANS', 'AD_ROMA'], description: 'Empresas seleccionadas (solo compatibles).' })
  @IsArray({ message: 'Las empresas deben ser una lista.' })
  @ArrayMinSize(1, { message: 'Seleccione al menos una empresa.' })
  @IsString({ each: true, message: 'Cada empresa debe ser un texto.' })
  companies!: string[];
}

export class CompanyConfigDto {
  @ApiProperty({ example: 'AD_ROMA' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;
}

export class StandardCompanyDto {
  @ApiProperty({ example: 'AD_TRANS' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiPropertyOptional({ example: true, description: 'Confirmación explícita de cambio de estándar.' })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
