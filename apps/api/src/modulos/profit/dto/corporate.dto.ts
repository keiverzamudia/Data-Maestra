import { ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** Empresas destino: códigos Profit (AD_TRANS es el estándar, no destino). */
export class CorporateCompaniesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Seleccione al menos una empresa destino.' })
  @IsString({ each: true })
  companies!: string[];

  /**
   * FASE 26.3 — Solo estos catálogos (claves: lin_art, sub_lin, unidades,
   * cat_art, colores, proceden, prov, tabulado). Ausente = todos.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  catalogs?: string[];

  /**
   * FASE 26.3/26.4 — Solo estas filas. La identidad es
   * `empresa|catálogo|código|padre`: en sub_lin el mismo `co_subl` se repite
   * bajo líneas distintas y sin el padre una sola casilla marcaría todas.
   * La selección ES la revisión: un BLOQUEADO tildado se aprueba; uno sin
   * tildar no se migra. Ausente = todo lo no bloqueado (comportamiento previo).
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CorporateItemSelectionDto)
  items?: CorporateItemSelectionDto[];
}

/**
 * FASE 26.3/26.4 — Una fila seleccionada para migrar.
 * `parent` es el padre del ESTÁNDAR (mismo valor que devuelve el plan).
 */
export class CorporateItemSelectionDto {
  @IsString()
  @IsNotEmpty()
  company!: string;

  @IsString()
  @IsNotEmpty()
  catalog!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  /** Padre canónico; vacío o ausente en catálogos planos. */
  @IsOptional()
  @IsString()
  parent?: string;
}

/** Clasificación del artículo a registrar (mismo contrato que el motor). */
export class CorporateArticleInputDto {
  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsString()
  @IsNotEmpty()
  articleType!: string;

  @IsString()
  @IsNotEmpty()
  groupCode!: string;

  @IsString()
  @IsNotEmpty()
  subgroupCode!: string;

  @IsString()
  @IsNotEmpty()
  unitCode!: string;

  @IsString()
  @IsNotEmpty()
  taxType!: string;

  @IsOptional()
  @IsString()
  categoryCode?: string;

  @IsOptional()
  @IsString()
  colorCode?: string;

  @IsOptional()
  @IsString()
  originCode?: string;

  @IsOptional()
  @IsString()
  providerCode?: string;

  @IsOptional()
  @IsString()
  costType?: string;

  @IsOptional()
  @IsString()
  disCen?: string;
}

export class CorporateRegisterArticleDto extends CorporateCompaniesDto {
  @ValidateNested()
  @Type(() => CorporateArticleInputDto)
  article!: CorporateArticleInputDto;

  @IsOptional()
  @IsString()
  requestId?: string;
}

/**
 * FASE 26 — Equivalencia de catálogo entre empresas. La validación fuerte
 * (catálogo conocido, empresa ≠ estándar, formato de código) la hace
 * `validateEquivalence` en el dominio: mismo código, un solo origen.
 */
export class EquivalenceUpsertDto {
  @IsString()
  @IsNotEmpty()
  catalogKey!: string;

  @IsString()
  @IsNotEmpty()
  companyCode!: string;

  @IsString()
  @IsNotEmpty()
  standardCode!: string;

  @IsString()
  @IsNotEmpty()
  localCode!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

/** FASE 26 — Desactivar (borrado lógico; el histórico vive en auditoría). */
export class EquivalenceIdDto {
  @IsString()
  @IsNotEmpty()
  id!: string;
}

/** FASE 26 — Sugerencias de solo lectura para UNA empresa destino. */
export class EquivalenceSuggestDto {
  @IsString()
  @IsNotEmpty()
  company!: string;
}
