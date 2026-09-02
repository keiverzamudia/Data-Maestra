import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClassifyRequestDto {
  @ApiProperty({ example: 'grp-electronics' })
  @IsString()
  groupId!: string;

  @ApiProperty({ example: 'sub-sensors' })
  @IsString()
  subgroupId!: string;

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
