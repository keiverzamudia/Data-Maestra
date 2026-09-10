import { IsObject, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MigrateCompanyDto {
  @ApiProperty({ example: 'company-uuid-origen' })
  @IsUUID()
  fromCompanyId!: string;

  @ApiProperty({ example: 'company-uuid-destino' })
  @IsUUID()
  toCompanyId!: string;

  @ApiProperty({
    description: 'Mapa departamento origen → departamento destino (o null = sin departamento)',
    example: { 'dept-origen-uuid': 'dept-destino-uuid' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  departmentMap?: Record<string, string | null>;
}
