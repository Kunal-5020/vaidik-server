// src/payments/controllers/wallet.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WalletService } from '../services/wallet.service';
import { RechargeWalletDto } from '../dto/recharge-wallet.dto';
import { VerifyPaymentDto } from '../dto/verify-payment.dto';
import { GiftService } from '../services/gift.service';
import { SendDirectGiftDto } from '../dto/send-direct-gift.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(
    private walletService: WalletService,
    private giftService: GiftService,
  ) {}

  // ===== WALLET STATS =====

  /**
   * Get wallet statistics
   * GET /wallet/stats
   */
  @Get('stats')
  async getWalletStats(@Req() req: AuthenticatedRequest) {
    return this.walletService.getWalletStats(req.user._id);
  }

  /**
   * Get wallet with hold status
   * GET /wallet/stats/with-hold
   */
  @Get('stats/with-hold')
  async getWalletWithHold(@Req() req: AuthenticatedRequest) {
    return this.walletService.getWalletWithHold(req.user._id);
  }

  /**
   * Get payment logs
   * GET /wallet/payment-logs
   */
  @Get('payment-logs')
  async getPaymentLogs(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.walletService.getPaymentLogs(req.user._id, page, limit, status);
  }

  // ===== RECHARGE =====

  /**
   * Create recharge transaction (Razorpay only)
   * POST /wallet/recharge
   */
  @Post('recharge')
  async rechargeWallet(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) rechargeDto: RechargeWalletDto,
  ) {
    return this.walletService.createRechargeTransaction(
      req.user._id,
      rechargeDto.amount,
      rechargeDto.currency || 'INR',
    );
  }

  /**
   * Verify payment
   * POST /wallet/verify-payment
   */
  @Post('verify-payment')
  async verifyPayment(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) verifyDto: VerifyPaymentDto,
  ) {
    return this.walletService.verifyPayment(
      verifyDto.transactionId,
      verifyDto.paymentId,
      verifyDto.status,
      verifyDto.promotionId,
      verifyDto.bonusPercentage,
    );
  }

  /**
   * Redeem gift card (adds non-withdrawable bonus balance)
   * POST /wallet/redeem-giftcard
   */
  @Post('redeem-giftcard')
  async redeemGiftCard(@Req() req: AuthenticatedRequest, @Body('code') code: string) {
    return this.walletService.redeemGiftCard(req.user._id, code);
  }

  // ===== TRANSACTIONS =====

  /**
   * Get wallet transactions
   * GET /wallet/transactions
   */
  @Get('transactions')
  async getTransactions(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.walletService.getUserTransactions(req.user._id, page, limit, {
      type,
      status,
    });
  }

  /**
   * Get transaction details
   * GET /wallet/transactions/:transactionId
   */
  @Get('transactions/:transactionId')
  async getTransactionDetails(
    @Param('transactionId') transactionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.walletService.getTransactionDetails(transactionId, req.user._id);
  }

  // ===== GIFTS =====

  /**
   * Send direct gift
   * POST /wallet/gifts/direct
   */
  @Post('gifts/direct')
  async sendDirectGift(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) giftDto: SendDirectGiftDto,
  ) {
    const result = await this.giftService.sendGift({
      userId: req.user._id,
      astrologerId: giftDto.astrologerId,
      amount: giftDto.amount,
      giftType: giftDto.giftType,
      context: 'direct',
    });

    return {
      success: true,
      message: 'Gift sent successfully',
      data: {
        transactionId: result.transactionId,
        newBalance: result.newBalance,
        astrologerId: result.astrologerId,
        astrologerName: result.astrologerName,
        astrologerEarning: result.astrologerEarning,
        platformCommission: result.platformCommission,
      },
    };
  }

  /**
   * ✅ NEW: Get user's gift history
   * GET /wallet/gifts/history
   */
  @Get('gifts/history')
  async getGiftHistory(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('context') context?: 'direct' | 'stream',
  ) {
    return this.giftService.getUserGiftHistory(req.user._id, {
      page,
      limit,
      context,
    });
  }

  /**
   * ✅ NEW: Get gift statistics
   * GET /wallet/gifts/stats
   */
  @Get('gifts/stats')
  async getGiftStats(@Req() req: AuthenticatedRequest) {
    const result = await this.giftService.getUserGiftHistory(req.user._id, {
      page: 1,
      limit: 1000, // Get all for stats
    });

    const totalGifts = result.data.gifts.length;
    const totalAmount = result.data.gifts.reduce((sum, gift) => sum + Math.abs(gift.amount), 0);
    const directGifts = result.data.gifts.filter((g) => g.context === 'direct').length;
    const streamGifts = result.data.gifts.filter((g) => g.context === 'stream').length;

    return {
      success: true,
      data: {
        totalGifts,
        totalAmount,
        directGifts,
        streamGifts,
        recentGifts: result.data.gifts.slice(0, 5),
      },
    };
  }
}
