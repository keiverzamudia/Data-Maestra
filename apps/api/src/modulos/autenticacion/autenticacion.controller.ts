import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AutenticacionService } from './autenticacion.service';

@ApiTags('Auth')
@Controller('auth')
export class AutenticacionController {
  constructor(private readonly authService: AutenticacionService) {}

  @Get('session')
  @ApiOperation({ summary: 'Get current user session' })
  @ApiQuery({ name: 'userId', required: false, description: 'Switch test user (dev only)' })
  getSession(@Query('userId') userId?: string) {
    if (userId) {
      this.authService.setCurrentUser(userId);
    }
    return this.authService.getSession();
  }

  @Get('users')
  @ApiOperation({ summary: 'List available test users (dev only)' })
  getUsers() {
    return this.authService.getTestUsers();
  }
}
