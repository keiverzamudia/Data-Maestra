import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmProposalDto {
  @ApiProperty({ example: 'uuid-de-propuesta' })
  @IsString()
  @IsNotEmpty({ message: 'El identificador de la propuesta es requerido.' })
  id!: string;

  @ApiPropertyOptional({ example: 'COM1', description: 'Código local a crear. Si se omite, se usa el propuesto.' })
  @IsOptional()
  @IsString()
  localCode?: string;
}

export class RejectProposalDto {
  @ApiProperty({ example: 'uuid-de-propuesta' })
  @IsString()
  @IsNotEmpty({ message: 'El identificador de la propuesta es requerido.' })
  id!: string;

  @ApiPropertyOptional({ example: 'Esa empresa ya tiene su propio grupo equivalente.' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class ConfirmAllDto {
  @ApiProperty({ example: 'AD_DIST' })
  @IsString()
  @IsNotEmpty({ message: 'Indique la empresa.' })
  company!: string;
}
