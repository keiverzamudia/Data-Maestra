import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyzeCatalogsDto {
  @ApiPropertyOptional({ example: 'AD_DIST', description: 'Analiza solo esta empresa.' })
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional({ example: 'lin_art', description: 'Analiza solo este catálogo.' })
  @IsOptional()
  @IsString()
  catalog?: string;

  @ApiPropertyOptional({ example: ['lin_art', 'sub_lin'], description: 'Catálogos concretos a analizar.' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  catalogs?: string[];

  @ApiPropertyOptional({ example: false, description: 'Incluye proveedores y procedencias (voluminosos).' })
  @IsOptional()
  @IsBoolean()
  includeProviders?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Crea automáticamente en Profit los elementos que SOLO faltan (nunca toca los existentes).',
  })
  @IsOptional()
  @IsBoolean()
  autoCreate?: boolean;

  @ApiPropertyOptional({ example: 20, description: 'Tamaño de la página de problemas (1..200).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ConfirmProposalDto {
  @ApiProperty({ example: 'uuid-de-propuesta' })
  @IsString()
  @IsNotEmpty({ message: 'El identificador de la propuesta es requerido.' })
  id!: string;

  @ApiPropertyOptional({ example: 'COM1', description: 'Código local a crear. Si se omite, se usa el propuesto.' })
  @IsOptional()
  @IsString()
  localCode?: string;
}

export class ConfirmBulkDto {
  @ApiProperty({ example: ['uuid-1', 'uuid-2'], description: 'Propuestas a confirmar en bloque.' })
  @IsArray()
  @ArrayMinSize(1, { message: 'Seleccione al menos una propuesta.' })
  @IsString({ each: true })
  ids!: string[];

  @ApiPropertyOptional({
    example: { 'uuid-1': 'COM1' },
    description: 'Códigos edited por propuesta (opcional).',
  })
  @IsOptional()
  @IsObject()
  overrides?: Record<string, string>;
}

export class RejectProposalDto {
  @ApiProperty({ example: 'uuid-de-propuesta' })
  @IsString()
  @IsNotEmpty({ message: 'El identificador de la propuesta es requerido.' })
  id!: string;

  @ApiPropertyOptional({ example: 'Esa empresa ya tiene su propio grupo equivalente.' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class DiscardProposalsDto {
  @ApiPropertyOptional({
    example: ['prov', 'proceden'],
    description: 'Catálogos a descartar. Si se omite, solo proveedores y procedencias.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  catalogs?: string[];
}

export class ConfirmAllDto {
  @ApiProperty({ example: 'AD_DIST' })
  @IsString()
  @IsNotEmpty({ message: 'Indique la empresa.' })
  company!: string;

  @ApiPropertyOptional({ example: 'lin_art', description: 'Limita a un catálogo de esa empresa.' })
  @IsOptional()
  @IsString()
  catalog?: string;
}
