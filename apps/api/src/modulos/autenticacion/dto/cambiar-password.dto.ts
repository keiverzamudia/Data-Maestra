import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * FASE 10E (corrección #11): sin userId. La identidad proviene de
 * request.user (JWT → Session). El frontend NO envía a quién cambiar.
 */
export class CambiarPasswordDto {
  @ApiProperty({ example: '••••••••' })
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ example: '••••••••', description: 'Mínimo 8 caracteres, diferente a la actual' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'La nueva contraseña debe tener al menos 8 caracteres.' })
  newPassword!: string;
}
