import { IsString, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetOverrideDto {
  @ApiProperty({ example: 'ADMIN.MANAGE' })
  @IsString()
  @IsNotEmpty()
  permissionCode!: string;

  @ApiProperty({ example: 'GRANT', enum: ['GRANT', 'DENY'] })
  @IsIn(['GRANT', 'DENY'])
  effect!: 'GRANT' | 'DENY';
}
