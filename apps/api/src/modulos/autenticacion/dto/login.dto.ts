import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'u-uuid', description: 'ID interno del usuario (seleccionado por displayName)' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ example: '••••••••' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
