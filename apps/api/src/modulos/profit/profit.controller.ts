import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProfitAdapterService } from './profit-adapter.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { RequirePermission } from '../autenticacion/require-permission.decorator';

@ApiTags('Profit')
@Controller('profit')
@UseGuards(JwtGuard, RbacGuard)
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

  @Get('categories')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'List categories from Profit cat_art (READ-ONLY)' })
  getCategories() {
    return this.profitAdapter.getCategories();
  }

  @Get('accounts')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'List accounting accounts from Profit sccuenta catalog (READ-ONLY)' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiQuery({ name: 'search', required: false })
  getAccounts(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 20;
    const o = offset ? parseInt(offset, 10) : 0;
    return this.profitAdapter.getAccounts(
      Math.min(Math.max(isNaN(n) ? 20 : n, 1), 100),
      Math.min(Math.max(isNaN(o) ? 0 : o, 0), 10000),
      search,
    );
  }

  @Get('brands')
  @RequirePermission('DASHBOARD.VIEW')
  @ApiOperation({ summary: 'List brands from Profit colores (READ-ONLY)' })
  getBrands() {
    return this.profitAdapter.getBrands();
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
