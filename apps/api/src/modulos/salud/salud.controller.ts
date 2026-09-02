import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SaludService } from './salud.service';

@ApiTags('Health')
@Controller('health')
export class SaludController {
  constructor(private readonly healthService: SaludService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  check() {
    return this.healthService.check();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check' })
  ready() {
    return this.healthService.ready();
  }
}
