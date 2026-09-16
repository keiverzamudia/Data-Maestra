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
  @ApiQuery({ name: 'statuses', required: false, description: 'Lista separada por comas (whitelist de estados; prevalece sobre status)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'scope', required: false, description: 'activas | historial' })
  @ApiQuery({ name: 'bucket', required: false, description: 'proceso | completadas | rechazadas' })
  @ApiQuery({ name: 'requesterId', required: false })
  @ApiQuery({ name: 'mine', required: false, description: 'true = solo propias (fuerza requesterId a la sesión)' })
  @ApiQuery({ name: 'sort', required: false, description: 'recientes | antiguas | actualizadas' })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false, description: '25, 50 or 100' })
  findAll(
    @CurrentUser() user: RequestUser,
    @Query('companyId') companyId?: string,
    @Query('status') status?: string,
    @Query('statuses') statuses?: string,
    @Query('search') search?: string,
    @Query('scope') scope?: string,
    @Query('bucket') bucket?: string,
    @Query('requesterId') requesterId?: string,
    @Query('mine') mine?: string,
    @Query('sort') sort?: string,
    @Query('departmentId') departmentId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.requestsService.findScoped(user.id, {
      companyId,
      status,
      statuses: statuses?.split(',').map(s => s.trim()).filter(Boolean),
      search,
      scope,
      bucket,
      requesterId,
      mine: mine === 'true',
      sort,
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

  @Get('todas')
  @RequirePermission('SOLICITUDES.VIEW_ALL')
  @ApiOperation({ summary: 'Todas las solicitudes del ámbito autorizado (gerencial, paginado en BD)' })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'statuses', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'bucket', required: false })
  @ApiQuery({ name: 'requesterId', required: false })
  @ApiQuery({ name: 'sort', required: false })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  findTodas(
    @CurrentUser() user: RequestUser,
    @Query('companyId') companyId?: string,
    @Query('status') status?: string,
    @Query('statuses') statuses?: string,
    @Query('search') search?: string,
    @Query('bucket') bucket?: string,
    @Query('requesterId') requesterId?: string,
    @Query('sort') sort?: string,
    @Query('departmentId') departmentId?: string,
    @Query('priority') priority?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = priority !== undefined && priority !== '' ? parseInt(priority, 10) : undefined;
    return this.requestsService.findGlobal(user.id, {
      companyId,
      status,
      statuses: statuses?.split(',').map(s => s.trim()).filter(Boolean),
      search,
      bucket,
      requesterId,
      sort,
      departmentId,
      priority: p !== undefined && Number.isInteger(p) ? p : undefined,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
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

  @Post(':id/profit-plan')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('PROFIT.WRITE')
  @ApiOperation({ summary: 'Plan Profit sin escritura: payload + candidato + disponibilidad (FASE 18: preparar es operación Profit, exige PROFIT.WRITE)' })
  async profitPlan(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.requestsService.planProfitCreation(id, user.id, companyId);
  }

  @Post(':id/profit-create')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('PROFIT.WRITE')
  @ApiOperation({ summary: 'Crear artículo en Profit (gates: CONTABILIDAD_APROBADA + PROFIT.WRITE + flag + payload). Con empresas: vía corporativa multiempresa (Fase 17).' })
  async profitCreate(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body?: { empresas?: string[] }) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.requestsService.createInProfit(id, user.id, companyId, body?.empresas);
  }

  @Post(':id/profit-verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('PROFIT.WRITE')
  @ApiOperation({ summary: 'Verificar un co_art en Profit (solo lectura, sin cambiar estados)' })
  async profitVerify(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() body: { coArt?: string }) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.requestsService.verifyProfitCreation(id, body?.coArt ?? '', user.id, companyId);
  }

  @Get(':id/profit-attempts')
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'Historial inmutable de intentos Profit (solo lectura)' })
  async profitAttempts(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.requestsService.profitAttempts(id, user.id);
  }

  @Post(':id/profit-retry')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('PROFIT.WRITE')
  @ApiOperation({ summary: 'Recuperar ERROR_PROFIT: revalida y re-encola a CONTABILIDAD_APROBADA (no escribe)' })
  async profitRetry(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.requestsService.requestProfitRetry(id, user.id, companyId);
  }
}
