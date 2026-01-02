// src/admin/features/payments/controllers/admin-payments.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  ValidationPipe,
} from '@nestjs/common';

import { AdminAuthGuard } from '../../../core/guards/admin-auth.guard';
import { PermissionsGuard } from '../../../core/guards/permissions.guard';
import { RequirePermissions } from '../../../core/decorators/permissions.decorator';
import { CurrentAdmin } from '../../../core/decorators/current-admin.decorator';
import { Permissions } from '../../../core/config/permissions.config';

import { AdminPaymentsService } from '../services/admin-payments.service';
import { ProcessPayoutDto } from '../dto/process-payout.dto';
import { RejectPayoutDto } from '../dto/reject-payout.dto';
import { CreateGiftCardDto } from '../dto/create-gift-card.dto';
import { UpdateGiftCardDto } from '../dto/update-gift-card.dto';
import { CompletePayoutDto } from '../dto/complete-payout.dto';
import { ProcessWalletRefundDto } from '../dto/process-wallet-refund.dto';

@Controller('admin/payments')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminPaymentsController {
  constructor(private adminPaymentsService: AdminPaymentsService) {}

  // ===== TRANSACTIONS =====

  /**
   * GET /admin/payments/transactions
   * Get all wallet transactions
   */
  @Get('transactions')
  @RequirePermissions(Permissions.PAYMENTS_VIEW)
  async getAllTransactions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.adminPaymentsService.getAllTransactions(page, limit, { type, status });
  }

  /**
   * GET /admin/payments/transactions/stats
   * Get transaction statistics
   */
  @Get('transactions/stats')
  @RequirePermissions(Permissions.PAYMENTS_VIEW)
  async getTransactionStats() {
    return this.adminPaymentsService.getTransactionStats();
  }

  // ===== PAYOUTS =====

  /**
   * GET /admin/payments/payouts
   * Get all payout requests
   */
  @Get('payouts')
  @RequirePermissions(Permissions.PAYOUTS_VIEW)
  async getAllPayouts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.adminPaymentsService.getAllPayouts(page, limit, { status });
  }

  /**
   * GET /admin/payments/payouts/pending
   * Get pending payout requests
   */
  @Get('payouts/pending')
  @RequirePermissions(Permissions.PAYOUTS_VIEW)
  async getPendingPayouts() {
    return this.adminPaymentsService.getPendingPayouts();
  }

  /**
   * GET /admin/payments/payouts/stats
   * Get payout statistics
   */
  @Get('payouts/stats')
  @RequirePermissions(Permissions.PAYOUTS_VIEW)
  async getPayoutStats() {
    return this.adminPaymentsService.getPayoutStats();
  }

  /**
   * GET /admin/payments/payouts/:payoutId
   * Get payout request details
   */
  @Get('payouts/:payoutId')
  @RequirePermissions(Permissions.PAYOUTS_VIEW)
  async getPayoutDetails(@Param('payoutId') payoutId: string) {
    return this.adminPaymentsService.getPayoutDetails(payoutId);
  }

  /**
   * POST /admin/payments/payouts/:payoutId/approve
   * Approve payout request
   */
  @Post('payouts/:payoutId/approve')
  @RequirePermissions(Permissions.PAYOUTS_APPROVE)
  async approvePayout(
    @Param('payoutId') payoutId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) processDto: ProcessPayoutDto,
  ) {
    return this.adminPaymentsService.approvePayout(payoutId, admin._id, processDto);
  }

  /**
   * POST /admin/payments/payouts/:payoutId/process
   * Mark payout as processing (status: approved → processing)
   */
  @Post('payouts/:payoutId/process')
  @RequirePermissions(Permissions.PAYOUTS_APPROVE)
  async processPayout(
    @Param('payoutId') payoutId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) processDto: ProcessPayoutDto,
  ) {
    return this.adminPaymentsService.processPayout(payoutId, admin._id, processDto);
  }

  /**
   * POST /admin/payments/payouts/:payoutId/complete
   * Complete payout (status: processing → completed)
   * ✅ This deducts money from astrologer balance
   */
  @Post('payouts/:payoutId/complete')
  @RequirePermissions(Permissions.PAYOUTS_APPROVE)
  async completePayout(
    @Param('payoutId') payoutId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) completeDto: CompletePayoutDto,
  ) {
    return this.adminPaymentsService.completePayout(payoutId, admin._id, completeDto);
  }

  /**
   * POST /admin/payments/payouts/:payoutId/reject
   * Reject payout request
   */
  @Post('payouts/:payoutId/reject')
  @RequirePermissions(Permissions.PAYOUTS_REJECT)
  async rejectPayout(
    @Param('payoutId') payoutId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) rejectDto: RejectPayoutDto,
  ) {
    return this.adminPaymentsService.rejectPayout(payoutId, admin._id, rejectDto.reason);
  }

  // ===== WALLET REFUNDS =====

  /**
   * GET /admin/payments/wallet-refunds
   * Get wallet refund requests (user cash-out)
   */
  @Get('wallet-refunds')
  @RequirePermissions(Permissions.PAYMENTS_VIEW)
  async listWalletRefundRequests(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
  ) {
    return this.adminPaymentsService.listWalletRefundRequests(page, limit, { status, userId });
  }

  /**
   * GET /admin/payments/wallet-refunds/:refundId
   * Get wallet refund request details
   */
  @Get('wallet-refunds/:refundId')
  @RequirePermissions(Permissions.PAYMENTS_VIEW)
  async getWalletRefundDetails(@Param('refundId') refundId: string) {
    return this.adminPaymentsService.getWalletRefundDetails(refundId);
  }

  /**
   * POST /admin/payments/wallet-refunds/:refundId/process
   * Process wallet refund request
   */
  @Post('wallet-refunds/:refundId/process')
  @RequirePermissions(Permissions.PAYMENTS_REFUND)
  async processWalletRefund(
    @Param('refundId') refundId: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) payload: ProcessWalletRefundDto,
  ) {
    return this.adminPaymentsService.processWalletRefund(refundId, admin._id, payload);
  }

  // ===== GIFT CARDS =====

  /**
   * GET /admin/payments/gift-cards
   * Get all gift cards
   */
  @Get('gift-cards')
  @RequirePermissions(Permissions.PAYMENTS_VIEW)
  async listGiftCards(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminPaymentsService.listGiftCards(page, limit, { status, search });
  }

  /**
   * GET /admin/payments/gift-cards/:code
   * Get gift card details
   */
  @Get('gift-cards/:code')
  @RequirePermissions(Permissions.PAYMENTS_VIEW)
  async getGiftCard(@Param('code') code: string) {
    return this.adminPaymentsService.getGiftCard(code);
  }

  /**
   * POST /admin/payments/gift-cards
   * Create new gift card
   */
  @Post('gift-cards')
@RequirePermissions(Permissions.PAYMENTS_PROCESS)
async createGiftCard(
  @CurrentAdmin() admin: any,
  @Body(ValidationPipe) createDto: CreateGiftCardDto,
) {
  return this.adminPaymentsService.createGiftCard({
    code: createDto.code,
    amount: createDto.amount,
    currency: createDto.currency,
    maxRedemptions: createDto.maxRedemptions,
    expiresAt: createDto.expiresAt ? new Date(createDto.expiresAt) : undefined, // ✅ Convert to Date
    metadata: createDto.metadata,
    createdBy: admin._id,
  });
}

  /**
   * PATCH /admin/payments/gift-cards/:code/status
   * Update gift card status
   */
  @Patch('gift-cards/:code/status')
  @RequirePermissions(Permissions.PAYMENTS_PROCESS)
  async updateGiftCardStatus(
    @Param('code') code: string,
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) updateDto: UpdateGiftCardDto,
  ) {
    return this.adminPaymentsService.updateGiftCardStatus(code, admin._id, updateDto.status);
  }

  @Post('transactions/:transactionId/refund-razorpay')
  @RequirePermissions(Permissions.PAYMENTS_REFUND)
  async refundRazorpayTransaction(
    @Param('transactionId') transactionId: string,
    @CurrentAdmin() admin: any,
    @Body('reason') reason: string,
  ) {
    return this.adminPaymentsService.refundRazorpayTransaction(transactionId, admin._id, reason);
  }

  @Post('bonus/manage')
  @RequirePermissions(Permissions.PAYMENTS_PROCESS) // Or a specific bonus permission
  async manageBonus(
    @CurrentAdmin() admin: any,
    @Body() body: { userId: string; amount: number; action: 'add' | 'deduct'; reason: string },
  ) {
    return this.adminPaymentsService.manageUserBonus(
        body.userId, 
        body.amount, 
        body.action, 
        body.reason, 
        admin._id
    );
  }
}
