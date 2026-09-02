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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { join } from 'path';
import { SolicitudesService } from './solicitud.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { RequirePermission } from '../autenticacion/require-permission.decorator';
import { CreateRequestDto } from './dto/create-request.dto';
import { ClassifyRequestDto } from './dto/classify-request.dto';
import { ApprovalDto } from './dto/approval.dto';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

@ApiTags('Requests')
@Controller('requests')
@UseGuards(RbacGuard)
export class SolicitudesController {
  constructor(
    private readonly requestsService: SolicitudesService,
    private readonly authService: AutenticacionService,
  ) {}

  @Post()
  @RequirePermission('REQUEST.CREATE')
  @ApiOperation({ summary: 'Create a new request' })
  create(@Body() dto: CreateRequestDto) {
    const session = this.authService.getSession();
    return this.requestsService.create(
      dto,
      session.id,
      session.company.id,
      session.department.id,
    );
  }

  @Get()
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'List requests' })
  @ApiQuery({ name: 'companyId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(
    @Query('companyId') companyId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.requestsService.findAll({ companyId, status, search });
  }

  @Get(':id')
  @RequirePermission('REQUEST.VIEW')
  @ApiOperation({ summary: 'Get request by ID' })
  findOne(@Param('id') id: string) {
    return this.requestsService.findOne(id);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('REQUEST.CREATE')
  @ApiOperation({ summary: 'Submit request for approval' })
  submit(@Param('id') id: string) {
    const session = this.authService.getSession();
    return this.requestsService.submit(id, session.id, session.company.id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('MANAGER.APPROVE')
  @ApiOperation({ summary: 'Approve, reject or return request' })
  approve(@Param('id') id: string, @Body() dto: ApprovalDto) {
    const session = this.authService.getSession();
    return this.requestsService.approve(id, dto, session.id, session.company.id);
  }

  @Post(':id/classify')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('WAREHOUSE.CLASSIFY')
  @ApiOperation({ summary: 'Save warehouse classification' })
  classify(@Param('id') id: string, @Body() dto: ClassifyRequestDto) {
    const session = this.authService.getSession();
    return this.requestsService.classify(id, dto, session.id, session.company.id);
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
  @ApiOperation({ summary: 'Get workflow history' })
  getHistory(@Param('id') id: string) {
    return this.requestsService.getHistory(id);
  }
}
