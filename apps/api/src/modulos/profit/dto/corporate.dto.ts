import { ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/** Empresas destino: códigos Profit (AD_TRANS es el estándar, no destino). */
export class CorporateCompaniesDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Seleccione al menos una empresa destino.' })
  @IsString({ each: true })
  companies!: string[];
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
