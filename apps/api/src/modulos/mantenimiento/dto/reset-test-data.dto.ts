import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetTestDataDto {
  @ApiProperty({
    example: 'BORRAR TODO',
    description: 'Confirmación escrita exacta. Debe ser "BORRAR TODO".',
  })
  @IsString()
  @IsNotEmpty()
  confirm!: string;
}
