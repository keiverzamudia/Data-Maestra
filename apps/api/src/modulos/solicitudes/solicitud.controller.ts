import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { join } from 'path';
import { SolicitudesService } from './solicitud.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';
import { CreateRequestDto } from './dto/create-request.dto';
import { ClassifyRequestDto } from './dto/classify-request.dto';
import { ApprovalDto } from './dto/approval.dto';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

@ApiTags('Requests')
@Controller('requests')
@UseGuards(JwtGuard, RbacGuard)
export class SolicitudesController {
  constructor(
    private readonly requestsService: SolicitudesService,
    private readonly authService: AutenticacionService,
  ) {}

  @Post()
  @RequirePermission('REQUEST.CREATE')
  @ApiOperation({ summary: 'Create a new request' })
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateRequestDto) {
    // 10E §4: companyId/departmentId del body = contexto funcional validado
    // contra membresías reales; la identidad es request.user.
    const companyId = await this.authService.resolveCompanyContext(user.id, dto.companyId);
    const memberships = await this.authService.getMemberships(user.id);
    const inCompany = memberships.find(m => m.companyId === companyId);
    const departmentId =
      dto.departmentId ??
      (inCompany && inCompany.departmentId ? inCompany.departmentId : undefined);
    if (!departmentId) {
      throw new ForbiddenException('Sin departamento asignado en la empresa indicada.');
    }
    await this.authService.requireDepartmentMembership(user.id, companyId, departmentId);
    return this.requestsService.create(dto, user.id, companyId, departmentId);
  }

  @Get()
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'List requests (role-scoped, paginated)' })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'scope', required: false, description: 'activas | historial' })
  @ApiQuery({ name: 'bucket', required: false, description: 'proceso | completadas | rechazadas' })
  @ApiQuery({ name: 'requesterId', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false, description: '25, 50 or 100' })
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('companyId') companyId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('scope') scope?: string,
    @Query('bucket') bucket?: string,
    @Query('requesterId') requesterId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.requestsService.findScoped(user.id, {
      companyId,
      status,
      search,
      scope,
      bucket,
      requesterId,
      departmentId,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('resumen')
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'Scoped counters (server-side)' })
  resumen(@CurrentUser() user: RequestUser) {
    return this.requestsService.resumen(user.id);
  }

  @Get(':id')
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'Get request by ID (scoped)' })
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.requestsService.findOne(id, user.id);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('REQUEST.CREATE')
  @ApiOperation({ summary: 'Submit request for approval' })
  async submit(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.requestsService.submit(id, user.id, companyId);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('MANAGER.APPROVE')
  @ApiOperation({ summary: 'Approve, reject or return request' })
  async approve(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ApprovalDto) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.requestsService.approve(id, dto, user.id, companyId);
  }

  @Post(':id/classify')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('WAREHOUSE.CLASSIFY')
  @ApiOperation({ summary: 'Save warehouse classification' })
  async classify(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: ClassifyRequestDto) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.requestsService.classify(id, dto, user.id, companyId);
  }

  @Post(':id/photo')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('REQUEST.CREATE')
  @ApiOperation({ summary: 'Upload reference photo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('photo', { dest: join(process.cwd(), 'uploads', 'requests') }))
  async uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      throw new BadRequestException(`Invalid file type. Allowed: JPG, PNG, WEBP`);
    }

    if (file.size > MAX_SIZE) {
      throw new BadRequestException(`File exceeds maximum size of 10 MB`);
    }

    return this.requestsService.savePhoto(id, file);
  }

  @Get(':id/history')
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'Get workflow history (scoped)' })
  getHistory(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.requestsService.getHistory(id, user.id);
  }
}
