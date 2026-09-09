import { IsString, IsNotEmpty, IsArray, ArrayNotEmpty, IsOptional, ArrayUnique } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignRoleBulkDto {
  @ApiProperty({ example: ['u-uuid-1', 'u-uuid-2'] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  userIds!: string[];

  @ApiProperty({ example: 'WAREHOUSE' })
  @IsString()
  @IsNotEmpty()
  roleCode!: string;

  @ApiProperty({ example: 'company-uuid' })
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @ApiProperty({ example: 'department-uuid', required: false, nullable: true })
  @IsString()
  @IsOptional()
  departmentId?: string | null;
}
