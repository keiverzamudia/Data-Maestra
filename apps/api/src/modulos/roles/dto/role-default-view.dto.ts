import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RoleDefaultViewDto {
  @ApiProperty({ example: 'solicitudes', required: false, nullable: true })
  @IsOptional()
  @IsString()
  defaultView?: string | null;
}
