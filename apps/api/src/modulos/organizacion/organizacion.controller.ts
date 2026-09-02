import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OrganizacionService } from './organizacion.service';
import { RbacGuard } from '../autenticacion/rbac.guard';

@ApiTags('Organización')
@Controller('organizacion')
@UseGuards(RbacGuard)
export class OrganizacionController {
  constructor(private readonly organizacionService: OrganizacionService) {}

  @Get('companies')
  @ApiOperation({ summary: 'List companies' })
  findCompanies() {
    return this.organizacionService.findCompanies();
  }

  @Get('departments')
  @ApiOperation({ summary: 'List departments' })
  @ApiQuery({ name: 'companyId', required: false })
  findDepartments(@Query('companyId') companyId?: string) {
    return this.organizacionService.findDepartments(companyId);
  }

  @Get('users')
  @ApiOperation({ summary: 'List users with roles' })
  @ApiQuery({ name: 'companyId', required: false })
  findUsers(@Query('companyId') companyId?: string) {
    return this.organizacionService.findUsers(companyId);
  }

  @Get('roles')
  @ApiOperation({ summary: 'List roles' })
  findRoles() {
    return this.organizacionService.findRoles();
  }
}
