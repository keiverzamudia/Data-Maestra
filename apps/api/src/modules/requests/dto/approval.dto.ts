import { IsString, IsIn, IsOptional, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApprovalDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT', 'RETURN'] })
  @IsString()
  @IsIn(['APPROVE', 'REJECT', 'RETURN'])
  action!: 'APPROVE' | 'REJECT' | 'RETURN';

  @ApiPropertyOptional({ example: 'Falta información del proveedor' })
  @IsString()
  @IsOptional()
  @ValidateIf((obj) => obj.action === 'REJECT' || obj.action === 'RETURN')
  comment?: string;
}
