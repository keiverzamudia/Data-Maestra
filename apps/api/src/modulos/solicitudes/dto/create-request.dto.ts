import { IsString, IsNumber, IsOptional, Min, Max, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRequestDto {
  @ApiProperty({ example: 'Sensor de temperatura para horno industrial' })
  @IsString()
  @MinLength(3)
  requestedDescription!: string;

  @ApiProperty({ example: 'Reemplazo de equipo dañado en línea de producción' })
  @IsString()
  purpose!: string;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 3 })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(3)
  priority?: number = 0;

  @ApiPropertyOptional({ example: 'https://storage.example.com/photos/sensor-v2.jpg' })
  @IsString()
  @IsOptional()
  referencePhotoUri?: string;
}
