import { Controller, Get, Post, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBody } from '@nestjs/swagger';
import { CatalogosService } from './catalogos.service';
import { CatalogImportService, CatalogImportRow } from './catalog-import.service';

@ApiTags('Catalogs')
@Controller('catalogs')
export class CatalogosController {
  constructor(
    private readonly catalogsService: CatalogosService,
    private readonly importService: CatalogImportService,
  ) {}

  @Get('groups')
  @ApiOperation({ summary: 'List all catalog groups' })
  findGroups() {
    return this.catalogsService.findAllGroups();
  }

  @Get('subgroups')
  @ApiOperation({ summary: 'List all catalog subgroups' })
  @ApiQuery({ name: 'groupId', required: false })
  findSubgroups(@Query('groupId') groupId?: string) {
    return this.catalogsService.findAllSubgroups(groupId);
  }

  @Get('categories')
  @ApiOperation({ summary: 'List all catalog categories' })
  @ApiQuery({ name: 'subgroupId', required: false })
  findCategories(@Query('subgroupId') subgroupId?: string) {
    return this.catalogsService.findAllCategories(subgroupId);
  }

  @Get('brands')
  @ApiOperation({ summary: 'List all brands' })
  findBrands() {
    return this.catalogsService.findAllBrands();
  }

  @Get('units')
  @ApiOperation({ summary: 'List all units of measure' })
  findUnits() {
    return this.catalogsService.findAllUnits();
  }

  @Post('import')
  @ApiOperation({ summary: 'Import catalog rows from external source (idempotent)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['rows'],
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            required: ['groupCode', 'groupName', 'subgroupCode', 'subgroupName'],
            properties: {
              groupCode: { type: 'string' },
              groupName: { type: 'string' },
              subgroupCode: { type: 'string' },
              subgroupName: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async importCatalog(@Body('rows') rows: CatalogImportRow[]) {
    return this.importService.importFromRows(rows);
  }
}
