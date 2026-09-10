import { IsString, IsOptional, IsIn, IsBoolean } from 'class-validator';
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

  @ApiPropertyOptional({ example: '7MF0543-1AA00-0AA0' })
  @IsString()
  @IsOptional()
  partNumber?: string;

  @ApiPropertyOptional({ example: 'Temperature monitoring in furnaces' })
  @IsString()
  @IsOptional()
  application?: string;

  @ApiPropertyOptional({ example: 'C', description: 'Tipo Profit art.tipo (dominio CK_art_TIPO: V/F/C/S/M/N/E)' })
  @IsString()
  @IsIn(['V', 'F', 'C', 'S', 'M', 'N', 'E'])
  @IsOptional()
  articleType?: string;

  @ApiPropertyOptional({ description: 'true si Warehouse cambió manualmente el default de línea (14C-FORM §18)' })
  @IsBoolean()
  @IsOptional()
  articleTypeManual?: boolean;

  @ApiPropertyOptional({ example: '1', description: 'Tasa Profit art.tipo_imp (tabulado 1-9). No usar co_imp.' })
  @IsString()
  @IsIn(['1', '2', '3', '4', '5', '6', '7', '8', '9'])
  @IsOptional()
  taxType?: string;

  @ApiPropertyOptional({ example: 'UND', description: 'Unidad Profit co_uni (uni_venta=suni_venta; valida trigger TrigI_art)' })
  @IsString()
  @IsOptional()
  unitCode?: string;
}
