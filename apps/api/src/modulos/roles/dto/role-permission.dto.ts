import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RolePermissionDto {
  @ApiProperty({ example: 'REQUEST.VIEW' })
  @IsString()
  @IsNotEmpty()
  permissionCode!: string;
}
