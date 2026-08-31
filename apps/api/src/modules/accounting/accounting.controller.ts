import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { AccountingService } from './accounting.service';
import { AuthService } from '../auth/auth.service';

@ApiTags('Accounting')
@Controller('accounting')
export class AccountingController {
  constructor(
    private readonly accountingService: AccountingService,
    private readonly authService: AuthService,
  ) {}

  @Get('pending')
  @ApiOperation({ summary: 'List requests pending accounting approval' })
  findPending() {
    return this.accountingService.findPendingApproval();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get request with classification and accounting data' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  findOne(@Param('id') id: string) {
    return this.accountingService.findOneForReview(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve with accounting codes' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async approve(
    @Param('id') id: string,
    @Body() body: { accountingCodes?: Array<{ code: string; description: string }> },
  ) {
    const session = this.authService.getSession();
    return this.accountingService.approve(id, body.accountingCodes ?? [], session.id, session.company.id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject with comment' })
  @ApiParam({ name: 'id', description: 'Request ID' })
  async reject(@Param('id') id: string, @Body('comment') comment?: string) {
    const session = this.authService.getSession();
    return this.accountingService.reject(id, comment, session.id, session.company.id);
  }
}
