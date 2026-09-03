import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClassifyRequestDto {
  @ApiProperty({ example: 'grp-electronics' })
  @IsString()
  @IsOptional()
  groupId?: string;

  @ApiProperty({ example: 'sub-sensors' })
  @IsString()
  @IsOptional()
  subgroupId?: string;

  @ApiPropertyOptional({ example: 'RVH', description: 'Código Profit de grupo (FASE 8F, preferido sobre groupId)' })
  @IsString()
  @IsOptional()
  groupCode?: string;

  @ApiPropertyOptional({ example: 'CAR', description: 'Código Profit de subgrupo dentro del grupo' })
  @IsString()
  @IsOptional()
  subgroupCode?: string;

  @ApiPropertyOptional({ example: '002', description: 'Código Profit de categoría (cat_art, independiente)' })
  @IsString()
  @IsOptional()
  categoryCode?: string;

  @ApiPropertyOptional({ example: 'ARTICULOS DE OFICINA' })
  @IsString()
  @IsOptional()
  categoryName?: string;

  @ApiPropertyOptional({ example: 'F01', description: 'Código Profit de marca/colores (co_color)' })
  @IsString()
  @IsOptional()
  brandCode?: string;

  @ApiPropertyOptional({ example: 'GASOLINA' })
  @IsString()
  @IsOptional()
  brandName?: string;

  @ApiPropertyOptional({ example: 'cat-temp-sensors' })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'brand-siemens' })
  @IsString()
  @IsOptional()
  brandId?: string;

  @ApiPropertyOptional({ example: 'unit-piece' })
  @IsString()
  @IsOptional()
  unitId?: string;

  @ApiPropertyOptional({ example: 'Siemens' })
  @IsString()
  @IsOptional()
  manufacturer?: string;

  @ApiPropertyOptional({ example: 'SITRANS TH520' })
  @IsString()
  @IsOptional()
  model?: string;

  @ApiPropertyOptional({ example: '7MF0543-1AA00-0AA0' })
  @IsString()
  @IsOptional()
  partNumber?: string;

  @ApiPropertyOptional({ example: 'Temperature monitoring in furnaces' })
  @IsString()
  @IsOptional()
  application?: string;
}
