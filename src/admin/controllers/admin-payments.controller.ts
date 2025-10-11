import { Controller, Get, Post, Param, Query, Body, UseGuards, DefaultValuePipe, ParseIntPipe, ValidationPipe } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { Permissions } from '../constants/permissions';
import { AdminPaymentsService } from '../services/admin-payments.service';
import { ProcessPayoutDto } from '../dto/process-payout.dto';

@Controller('admin/payments')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminPaymentsController {
  constructor(private adminPaymentsService: AdminPaymentsService) {}

  // Wallet Transactions
  @Get('transactions')
  @RequirePermissions(Permissions.PAYMENTS_VIEW)
  async getAllTransactions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('type') type?: string,
    @Query('status') status?: string
  ) {
    return this.adminPaymentsService.getAllTransactions(page, limit, { type, status });
  }

  @Get('transactions/stats')
  @RequirePermissions(Permissions.PAYMENTS_VIEW)
  async getTransactionStats() {
    return this.adminPaymentsService.getTransactionStats();
  }

  // Payouts
  @Get('payouts')
  @RequirePermissions(Permissions.PAYOUTS_VIEW)
  async getAllPayouts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string
  ) {
    return this.adminPaymentsService.getAllPayouts(page, limit, { status });
  }

  @Get('payouts/pending')
  @RequirePermissions(Permissions.PAYOUTS_VIEW)
  async getPendingPayouts() {
    return this.adminPaymentsService.getPendingPayouts();
  }

  @Get('payouts/stats')
  @RequirePermissions(Permissions.PAYOUTS_VIEW)
  async getPayoutStats() {
    return this.adminPaymentsService.getPayoutStats();
  }

  @Get('payouts/:payoutId')
  @RequirePermissions(Permissions.PAYOUTS_VIEW)
  async getPayoutDetails(@Param('payoutId') payoutId: string) {
    return this.adminPaymentsService.getPayoutDetails(payoutId);
  }

  @Post('payouts/:payoutId/approve')
  @RequirePermissions(Permissions.PAYOUTS_APPROVE)
  async approvePayout(
    @Param('payoutId') payoutId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) processDto: ProcessPayoutDto
  ) {
    return this.adminPaymentsService.approvePayout(payoutId, admin._id, processDto);
  }

  @Post('payouts/:payoutId/reject')
  @RequirePermissions(Permissions.PAYOUTS_REJECT)
  async rejectPayout(
    @Param('payoutId') payoutId: string,
    @CurrentAdmin() admin: any,
    @Body('reason') reason: string
  ) {
    return this.adminPaymentsService.rejectPayout(payoutId, admin._id, reason);
  }
}
