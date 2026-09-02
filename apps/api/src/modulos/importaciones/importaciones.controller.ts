import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBody } from '@nestjs/swagger';
import { ImportacionesService } from './importaciones.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { RequirePermission } from '../autenticacion/require-permission.decorator';

@ApiTags('Importaciones')
@Controller('importaciones')
@UseGuards(RbacGuard)
export class ImportacionesController {
  constructor(private readonly importacionesService: ImportacionesService) {}

  @Get('runs')
  @RequirePermission('IMPORT.VIEW')
  @ApiOperation({ summary: 'List import runs' })
  @ApiQuery({ name: 'companyId', required: false })
  findRuns(@Query('companyId') companyId?: string) {
    return this.importacionesService.findImportRuns(companyId);
  }

  @Get('runs/:id')
  @RequirePermission('IMPORT.VIEW')
  @ApiOperation({ summary: 'Get import run by ID' })
  findRunById(@Param('id') id: string) {
    return this.importacionesService.findImportRunById(id);
  }

  @Post('runs')
  @RequirePermission('IMPORT.RUN')
  @ApiOperation({ summary: 'Create a new import run' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        sourceName: { type: 'string' },
        companyId: { type: 'string' },
        rowsRead: { type: 'number' },
        rowsImported: { type: 'number' },
        rowsUnchanged: { type: 'number' },
        rowsFailed: { type: 'number' },
        rowsSkipped: { type: 'number' },
        errorSummary: { type: 'string' },
      },
      required: ['sourceName'],
    },
  })
  createRun(@Body() body: { sourceName: string; companyId?: string; rowsRead?: number; rowsImported?: number; rowsUnchanged?: number; rowsFailed?: number; rowsSkipped?: number; errorSummary?: string }) {
    return this.importacionesService.createImportRun(body);
  }

  @Get('source-items')
  @RequirePermission('IMPORT.VIEW')
  @ApiOperation({ summary: 'List source items' })
  @ApiQuery({ name: 'importRunId', required: false })
  @ApiQuery({ name: 'companyId', required: false })
  findSourceItems(@Query('importRunId') importRunId?: string, @Query('companyId') companyId?: string) {
    return this.importacionesService.findSourceItems(importRunId, companyId);
  }

  @Post('source-items')
  @RequirePermission('IMPORT.RUN')
  @ApiOperation({ summary: 'Create a source item' })
  createSourceItem(@Body() body: {
    importRunId?: string;
    companyId?: string;
    sourceRecordId: string;
    sourceCode?: string;
    originalDescription: string;
    normalizedDescription?: string;
    brand?: string;
    manufacturer?: string;
    model?: string;
    partNumber?: string;
    status?: string;
  }) {
    return this.importacionesService.createSourceItem(body);
  }
}
