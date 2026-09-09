import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RemoveRoleDto {
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
