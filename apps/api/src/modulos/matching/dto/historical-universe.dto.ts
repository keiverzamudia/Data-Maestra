import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

// Mensajes en español (regla FASE 19: lo visible siempre en español).
const DEBE_SER_TEXTO = 'Este campo debe ser un texto.';

/** Ingesta histórica por lotes de una compañía (ADMIN.MANAGE). */
export class IngestCompanyDto {
  @IsString({ message: 'El código de empresa debe ser un texto.' })
  @IsNotEmpty({ message: 'El código de empresa es requerido.' })
  companyCode!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El tamaño de lote debe ser un número entero.' })
  @Min(1, { message: 'El tamaño de lote mínimo es 1.' })
  @Max(500, { message: 'El tamaño de lote máximo es 500.' })
  batchSize?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El número de lotes debe ser un número entero.' })
  @Min(1, { message: 'El número mínimo de lotes es 1.' })
  @Max(20, { message: 'El número máximo de lotes es 20.' })
  maxBatches?: number;

  /** FASE 23.2 — desplazamiento inicial para reanudar (universo > tope por llamada). */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El desplazamiento debe ser un número entero.' })
  @Min(0, { message: 'El desplazamiento mínimo es 0.' })
  startOffset?: number;
}

const COVERAGES = ['INSUFICIENTE', 'BASICA', 'COMPARABLE', 'RICA'] as const;

/** Filtros acotados de consulta histórica (ADMIN.MANAGE). */
export class HistoricalQueryDto {
  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  companyCode?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  code?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  text?: string;

  @IsOptional()
  @IsIn([...COVERAGES], { message: 'La cobertura no es válida.' })
  coverage?: (typeof COVERAGES)[number];

  @IsOptional()
  @Type(() => Boolean)
  hasTechnical?: boolean;
}
