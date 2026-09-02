import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CatalogosService } from './catalogos.service';

@ApiTags('Catalogs')
@Controller('catalogs')
export class CatalogosController {
  constructor(private readonly catalogsService: CatalogosService) {}

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
}
