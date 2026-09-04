import { Controller, Get, Post, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { RevisionFinalService } from './revision-final.service';
import { AutenticacionService } from '../autenticacion/autenticacion.service';
import { RbacGuard } from '../autenticacion/rbac.guard';
import { JwtGuard } from '../autenticacion/jwt.guard';
import { CurrentUser, RequestUser } from '../autenticacion/current-user.decorator';
import { RequirePermission } from '../autenticacion/require-permission.decorator';

@ApiTags('Final Review')
@Controller('final-review')
@UseGuards(JwtGuard, RbacGuard)
export class RevisionFinalController {
  constructor(
    private readonly finalReviewService: RevisionFinalService,
    private readonly authService: AutenticacionService,
  ) {}

  @Get('pending')
  @RequirePermission('FINAL_REVIEW.APPROVE')
  @ApiOperation({ summary: 'List requests pending final review' })
  findPending() {
    return this.finalReviewService.findPendingReview();
  }

  @Get(':id')
  @RequirePermission('FINAL_REVIEW.APPROVE')
  @ApiOperation({ summary: 'Get request for final review' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  findOne(@Param('id') id: string) {
    return this.finalReviewService.findOneForReview(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('FINAL_REVIEW.APPROVE')
  @ApiOperation({ summary: 'Approve request at final review' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async approve(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.finalReviewService.approve(id, user.id, companyId);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('FINAL_REVIEW.APPROVE')
  @ApiOperation({ summary: 'Reject request at final review' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async reject(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body('comment') comment?: string) {
    const companyId = await this.authService.resolveCompanyContext(user.id);
    return this.finalReviewService.reject(id, comment, user.id, companyId);
  }
}
