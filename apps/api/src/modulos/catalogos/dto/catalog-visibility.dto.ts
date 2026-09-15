import { IsIn, IsOptional, IsString, IsBoolean, IsArray, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CatalogModeDto {
  @ApiProperty({ example: 'SELECTED', enum: ['ALL', 'SELECTED'] })
  @IsIn(['ALL', 'SELECTED'])
  mode!: string;

  @ApiPropertyOptional({ description: 'Empresa; omitido = configuración global' })
  @IsString()
  @IsOptional()
  companyId?: string;
}

export class CatalogItemCodeDto {
  @ApiProperty({ example: 'AGR' })
  @IsString()
  @MaxLength(30)
  code!: string;

  @ApiPropertyOptional({ example: 'AGR', description: 'Código padre (subgrupo → grupo)' })
  @IsString()
  @IsOptional()
  parentCode?: string;
}

export class CatalogItemsDto {
  @ApiProperty({ type: [CatalogItemCodeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogItemCodeDto)
  codes!: CatalogItemCodeDto[];

  @ApiProperty({ example: true })
  @IsBoolean()
  visible!: boolean;

  @ApiPropertyOptional({ description: 'Empresa; omitido = configuración global' })
  @IsString()
  @IsOptional()
  companyId?: string;
}
