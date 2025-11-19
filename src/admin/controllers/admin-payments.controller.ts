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

  // Wallet refund-to-bank (user cash-out)

  @Get('wallet-refunds')
  @RequirePermissions(Permissions.PAYMENTS_VIEW)
  async listWalletRefunds(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
  ) {
    return this.adminPaymentsService.listWalletRefundRequests(page, limit, {
      status,
      userId,
    });
  }

  @Get('wallet-refunds/:refundId')
  @RequirePermissions(Permissions.PAYMENTS_VIEW)
  async getWalletRefundDetails(@Param('refundId') refundId: string) {
    return this.adminPaymentsService.getWalletRefundDetails(refundId);
  }

  @Post('wallet-refunds/:refundId/process')
  @RequirePermissions(Permissions.PAYMENTS_PROCESS)
  async processWalletRefund(
    @Param('refundId') refundId: string,
    @CurrentAdmin() admin: any,
    @Body('amountApproved') amountApproved: number,
    @Body('paymentReference') paymentReference: string,
  ) {
    return this.adminPaymentsService.processWalletRefund(refundId, admin._id, {
      amountApproved,
      paymentReference,
    });
  }

  // Gift cards

  @Post('giftcards')
  @RequirePermissions(Permissions.PAYMENTS_PROCESS)
  async createGiftCard(
    @CurrentAdmin() admin: any,
    @Body('code') code: string,
    @Body('amount') amount: number,
    @Body('currency') currency?: string,
    @Body('maxRedemptions') maxRedemptions?: number,
    @Body('expiresAt') expiresAt?: string,
    @Body('metadata') metadata?: Record<string, any>,
  ) {
    const expiresDate = expiresAt ? new Date(expiresAt) : undefined;
    return this.adminPaymentsService.createGiftCard({
      code,
      amount,
      currency,
      maxRedemptions,
      expiresAt: expiresDate,
      metadata,
      createdBy: admin._id,
    });
  }

  @Get('giftcards')
  @RequirePermissions(Permissions.PAYMENTS_VIEW)
  async listGiftCards(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminPaymentsService.listGiftCards(page, limit, { status, search });
  }

  @Get('giftcards/:code')
  @RequirePermissions(Permissions.PAYMENTS_VIEW)
  async getGiftCard(@Param('code') code: string) {
    return this.adminPaymentsService.getGiftCard(code);
  }

  @Post('giftcards/:code/status')
  @RequirePermissions(Permissions.PAYMENTS_PROCESS)
  async updateGiftCardStatus(
    @Param('code') code: string,
    @CurrentAdmin() admin: any,
    @Body('status') status: 'active' | 'disabled' | 'expired',
  ) {
    return this.adminPaymentsService.updateGiftCardStatus(code, admin._id, status);
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
