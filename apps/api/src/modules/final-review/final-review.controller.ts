import { Controller, Get, Post, Param, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { FinalReviewService } from './final-review.service';
import { AuthService } from '../auth/auth.service';
import { RbacGuard } from '../auth/rbac.guard';
import { RequirePermission } from '../auth/require-permission.decorator';

@ApiTags('Final Review')
@Controller('final-review')
@UseGuards(RbacGuard)
export class FinalReviewController {
  constructor(
    private readonly finalReviewService: FinalReviewService,
    private readonly authService: AuthService,
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
  async approve(@Param('id') id: string) {
    const session = this.authService.getSession();
    return this.finalReviewService.approve(id, session.id, session.company.id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('FINAL_REVIEW.APPROVE')
  @ApiOperation({ summary: 'Reject request at final review' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async reject(@Param('id') id: string, @Body('comment') comment?: string) {
    const session = this.authService.getSession();
    return this.finalReviewService.reject(id, comment, session.id, session.company.id);
  }
}
