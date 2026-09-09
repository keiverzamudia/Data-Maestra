import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RemoveOverrideDto {
  @ApiProperty({ example: 'ADMIN.MANAGE' })
  @IsString()
  @IsNotEmpty()
  permissionCode!: string;
}
