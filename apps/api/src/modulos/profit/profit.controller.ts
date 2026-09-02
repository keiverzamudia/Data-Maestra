import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProfitAdapterService } from './profit-adapter.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { RequirePermission } from '../autenticacion/require-permission.decorator';

@ApiTags('Profit')
@Controller('profit')
@UseGuards(RbacGuard)
export class ProfitController {
  constructor(private readonly profitAdapter: ProfitAdapterService) {}

  @Get('groups')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'List groups from Profit (READ-ONLY)' })
  getGroups() {
    return this.profitAdapter.getGroups();
  }

  @Get('subgroups')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'List subgroups from Profit (READ-ONLY)' })
  @ApiQuery({ name: 'co_lin', required: false })
  getSubgroups(@Query('co_lin') co_lin?: string) {
    return this.profitAdapter.getSubgroups(co_lin);
  }

  @Get('units')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'List units from Profit (READ-ONLY)' })
  getUnits() {
    return this.profitAdapter.getUnits();
  }

  @Get('articles')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'List articles from Profit (READ-ONLY)' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'co_lin', required: false })
  getArticles(
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('co_lin') co_lin?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 20;
    return this.profitAdapter.getArticles(Math.min(isNaN(n) ? 20 : n, 100), search, co_lin);
  }

  @Get('articles/:code')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Get article by code from Profit (READ-ONLY)' })
  getArticle(@Param('code') code: string) {
    return this.profitAdapter.getArticle(code);
  }

  @Get('articles/:code/details')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'Get article with group/subgroup/unit from Profit (READ-ONLY)' })
  getArticleDetails(@Param('code') code: string) {
    return this.profitAdapter.getArticleWithDetails(code);
  }
}
