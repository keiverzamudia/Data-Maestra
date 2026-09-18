import { IsNotEmpty, IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import type { MatchDecisionKind } from '../domain/matching-contracts';

// Mensajes de validación en español (regla FASE 19 §25/§26): lo visible al
// usuario siempre en español; los códigos internos no cambian.
const REQUERIDO = 'Este campo es requerido.';
const DEBE_SER_TEXTO = 'Este campo debe ser un texto.';

/** Normaliza un input libre sin persistir (REQUEST.VIEW). */
export class NormalizeArticleDto {
  @IsString({ message: 'La descripción debe ser un texto.' })
  @IsNotEmpty({ message: 'La descripción es requerida para normalizar.' })
  description!: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  purpose?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  brand?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  model?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  partNumber?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  category?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  subCategory?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  unit?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  application?: string;
}

/** Obtiene o crea el perfil de un artículo Profit (solo lee Profit). */
export class UpsertProfileDto {
  @IsString({ message: 'El código de empresa debe ser un texto.' })
  @IsNotEmpty({ message: 'El código de empresa es requerido.' })
  companyCode!: string;

  @IsString({ message: 'El código de artículo debe ser un texto.' })
  @IsNotEmpty({ message: 'El código de artículo es requerido.' })
  profitArticleCode!: string;
}

const DECISIONS: MatchDecisionKind[] = ['SAME', 'DIFFERENT', 'REVIEW'];

/** Registra una decisión humana entre dos artículos (WAREHOUSE.CLASSIFY). */
export class RegisterDecisionDto {
  @IsString({ message: DEBE_SER_TEXTO })
  @IsNotEmpty({ message: REQUERIDO })
  articleACompany!: string;

  @IsString({ message: DEBE_SER_TEXTO })
  @IsNotEmpty({ message: REQUERIDO })
  articleAProfitCode!: string;

  @IsString({ message: DEBE_SER_TEXTO })
  @IsNotEmpty({ message: REQUERIDO })
  articleBCompany!: string;

  @IsString({ message: DEBE_SER_TEXTO })
  @IsNotEmpty({ message: REQUERIDO })
  articleBProfitCode!: string;

  @IsString({ message: DEBE_SER_TEXTO })
  @IsIn(DECISIONS, { message: 'La decisión no es válida.' })
  decision!: MatchDecisionKind;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  reason?: string;
}

/** Consulta candidatos del motor para una solicitud (REQUEST.VIEW). */
export class CandidatesForRequestDto {
  @IsString({ message: 'El identificador de solicitud debe ser un texto.' })
  @IsNotEmpty({ message: 'El identificador de solicitud es requerido.' })
  requestId!: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  companyCode?: string;
}

/** Vincula una solicitud con un artículo existente (WAREHOUSE.CLASSIFY). */
export class LinkRequestDto {
  @IsString({ message: 'El código de empresa debe ser un texto.' })
  @IsNotEmpty({ message: 'El código de empresa es requerido.' })
  companyCode!: string;

  @IsString({ message: 'El código de artículo debe ser un texto.' })
  @IsNotEmpty({ message: 'El código de artículo es requerido.' })
  profitArticleCode!: string;

  @IsString({ message: DEBE_SER_TEXTO })
  @IsIn(['SAME', 'DIFFERENT'] as const, { message: 'La decisión no es válida.' })
  decision!: 'SAME' | 'DIFFERENT';
}

/**
 * FASE 23.1 — Analizador de Almacén: solicitud + borrador del formulario
 * (datos aún no guardados) + universo acotado. REQUEST.VIEW.
 */
export class AnalyzeDraftDto {
  @IsString({ message: 'El identificador de solicitud debe ser un texto.' })
  @IsNotEmpty({ message: 'El identificador de solicitud es requerido.' })
  requestId!: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  description?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  purpose?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  groupCode?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  subgroupCode?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  categoryCode?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  brandCode?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  unitCode?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  taxType?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  partNumber?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  application?: string;

  @IsOptional()
  @IsString({ message: DEBE_SER_TEXTO })
  companyCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'El límite debe ser un número entero.' })
  @Min(1, { message: 'El límite mínimo es 1.' })
  @Max(20, { message: 'El límite máximo es 20.' })
  limit?: number;
}
