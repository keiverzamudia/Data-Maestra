import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

const DEBE_SER_TEXTO = 'Este campo debe ser un texto.';
const CLASIFICACIONES = ['HIGH', 'MEDIUM', 'LOW', 'REVIEW'] as const;
const ORDENES = ['score', 'classification', 'detectedAt', 'evidenceCount', 'conflictCount'] as const;

/** Detección histórica controlada por lotes (ADMIN.MANAGE). */
export class DetectDuplicatesDto {
  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  companyCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tamaño de lote debe ser un número entero.' })
  @Min(1, { message: 'El tamaño de lote mínimo es 1.' })
  @Max(500, { message: 'El tamaño de lote máximo es 500.' })
  batchSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El número de semillas debe ser un número entero.' })
  @Min(1, { message: 'El número mínimo de semillas es 1.' })
  @Max(2000, { message: 'El número máximo de semillas es 2000.' })
  maxSeeds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tamaño de cubeta debe ser un número entero.' })
  @Min(2, { message: 'El tamaño mínimo de cubeta es 2.' })
  @Max(200, { message: 'El tamaño máximo de cubeta es 200.' })
  maxBucketSize?: number;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  cursorCompanyCode?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  cursorProfitCode?: string;
}

/** Filtros acotados de relaciones históricas (ADMIN.MANAGE). */
export class RelationQueryDto {
  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  companyCode?: string;

  @IsOptional()
  @IsIn([...CLASIFICACIONES], { message: 'La clasificación no es válida.' })
  classification?: (typeof CLASIFICACIONES)[number];

  @IsOptional()
  @Type(() => Boolean)
  conConflictos?: boolean;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  coverage?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  status?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  code?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  text?: string;

  @IsOptional()
  @IsIn([...ORDENES], { message: 'El orden no es válido.' })
  orderBy?: (typeof ORDENES)[number];

  @IsOptional()
  @IsIn(['asc', 'desc'] as const, { message: 'La dirección no es válida.' })
  orderDir?: 'asc' | 'desc';
}
