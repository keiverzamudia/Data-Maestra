import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { OrganizacionService } from './organizacion.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { MigrateCompanyDto } from './dto/migrate-company.dto';

@ApiTags('Organización')
@Controller('organizacion')
@UseGuards(JwtGuard, RbacGuard)
export class OrganizacionController {
  constructor(
    private readonly organizacionService: OrganizacionService,
    private readonly authService: AutenticacionService,
  ) {}

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

  @Patch('departments/:id')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Update department name/manager (audited)' })
  async updateDepartment(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() user: RequestUser,
  ) {
    const memberships = await this.authService.getMemberships(user.id);
    const actorCompanyId = memberships.length === 1 ? memberships[0]!.companyId : undefined;
    return this.organizacionService.updateDepartment(id, dto, user.id, actorCompanyId);
  }

  @Post('departments')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Create department (audited)' })
  async createDepartment(@Body() dto: CreateDepartmentDto, @CurrentUser() user: RequestUser) {
    return this.organizacionService.createDepartment(dto, user.id);
  }

  @Post('companies')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Create company (audited)' })
  async createCompany(@Body() dto: CreateCompanyDto, @CurrentUser() user: RequestUser) {
    return this.organizacionService.createCompany(dto, user.id);
  }

  @Patch('companies/:id')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Update company (id never changes, audited)' })
  async updateCompany(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.organizacionService.updateCompany(id, dto, user.id);
  }

  @Delete('companies/:id')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Delete company only without references (else 409)' })
  async deleteCompany(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.organizacionService.deleteCompany(id, user.id);
  }

  @Get('companies/:id/migration-preview')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Preview company migration (no changes)' })
  @ApiQuery({ name: 'to', required: true })
  async migrationPreview(@Param('id') id: string, @Query('to') to: string) {
    return this.organizacionService.previewMigration(id, to);
  }

  @Post('companies/migrate')
  @RequirePermission('ADMIN.MANAGE')
  @ApiOperation({ summary: 'Migrate users company-to-company (transactional) and retire origin' })
  async migrateCompany(@Body() dto: MigrateCompanyDto, @CurrentUser() user: RequestUser) {
    return this.organizacionService.migrateCompany(dto, user.id);
  }
}
