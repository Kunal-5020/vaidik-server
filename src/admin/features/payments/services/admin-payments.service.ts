// src/admin/features/payments/services/admin-payments.service.ts
import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { WalletTransaction, WalletTransactionDocument } from '../../../../payments/schemas/wallet-transaction.schema';
import { PayoutRequest, PayoutRequestDocument } from '../../../../payments/schemas/payout-request.schema';
import { WalletRefundRequest, WalletRefundRequestDocument } from '../../../../payments/schemas/wallet-refund-request.schema';
import { GiftCard, GiftCardDocument } from '../../../../payments/schemas/gift-card.schema';

import { AdminActivityLogService } from '../../activity-logs/services/admin-activity-log.service';
import { NotificationService } from '../../../../notifications/services/notification.service';
import { WalletService } from '../../../../payments/services/wallet.service';
import { ProcessPayoutDto } from '../dto/process-payout.dto';
import { ProcessWalletRefundDto } from '../dto/process-wallet-refund.dto';
import { Astrologer, AstrologerDocument } from '../../../../astrologers/schemas/astrologer.schema';
import { CompletePayoutDto } from '../dto/complete-payout.dto';

@Injectable()
export class AdminPaymentsService {
  private readonly logger = new Logger(AdminPaymentsService.name);

  constructor(
    @InjectModel(WalletTransaction.name) private transactionModel: Model<WalletTransactionDocument>,
    @InjectModel(PayoutRequest.name) private payoutModel: Model<PayoutRequestDocument>,
    @InjectModel(WalletRefundRequest.name) private walletRefundModel: Model<WalletRefundRequestDocument>,
    @InjectModel(GiftCard.name) private giftCardModel: Model<GiftCardDocument>,
     @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>, // ✅ Add this
    private activityLogService: AdminActivityLogService,
    private notificationService: NotificationService,
    private walletService: WalletService,
  ) {}

  // ===== TRANSACTIONS =====

  /**
   * Get all transactions
   */
  async getAllTransactions(
    page: number = 1,
    limit: number = 50,
    filters?: { type?: string; status?: string }
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters?.type) query.type = filters.type;
    if (filters?.status) query.status = filters.status;

    const [transactions, total] = await Promise.all([
      this.transactionModel
        .find(query)
        .populate('userId', 'name phoneNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.transactionModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        transactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  /**
   * Get transaction statistics
   */
  async getTransactionStats(): Promise<any> {
    const [
      totalRecharge,
      totalSpent,
      totalBonusCredited,
      totalGiftcards,
      totalRefunds,
      totalWithdrawals,
    ] = await Promise.all([
      this.transactionModel.aggregate([
        { $match: { type: 'recharge', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.transactionModel.aggregate([
        { $match: { type: 'deduction', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.transactionModel.aggregate([
        { $match: { type: { $in: ['bonus', 'reward', 'refund'] }, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.transactionModel.aggregate([
        { $match: { type: 'giftcard', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.transactionModel.aggregate([
        { $match: { type: 'refund', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.transactionModel.aggregate([
        { $match: { type: 'withdrawal', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    return {
      success: true,
      data: {
        totalRecharge: totalRecharge[0]?.total || 0,
        totalSpent: totalSpent[0]?.total || 0,
        totalBonusCredited: totalBonusCredited[0]?.total || 0,
        totalGiftcards: totalGiftcards[0]?.total || 0,
        totalOrderRefunds: totalRefunds[0]?.total || 0,
        totalWithdrawals: totalWithdrawals[0]?.total || 0,
      },
    };
  }

  // ===== PAYOUTS =====

  /**
   * Get all payouts
   */
  async getAllPayouts(
    page: number = 1,
    limit: number = 50,
    filters?: { status?: string }
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters?.status) query.status = filters.status;

    const [payouts, total] = await Promise.all([
      this.payoutModel
        .find(query)
        .populate('astrologerId', 'name phoneNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.payoutModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        payouts,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  /**
   * Get pending payouts
   */
  async getPendingPayouts(): Promise<any> {
    const payouts = await this.payoutModel
      .find({ status: 'pending' })
      .populate('astrologerId', 'name phoneNumber')
      .sort({ createdAt: 1 })
      .lean();

    return {
      success: true,
      data: payouts,
    };
  }

  /**
   * Get payout details
   */
  async getPayoutDetails(payoutId: string): Promise<any> {
    const payout = await this.payoutModel
      .findOne({ payoutId })
      .populate('astrologerId')
      .lean();

    if (!payout) {
      throw new NotFoundException('Payout request not found');
    }

    return {
      success: true,
      data: payout,
    };
  }

  /**
   * Approve payout (pending → approved)
   * ❌ Does NOT deduct money yet
   */
  async approvePayout(payoutId: string, adminId: string, processDto: ProcessPayoutDto): Promise<any> {
    const payout = await this.payoutModel.findOne({ payoutId });
    if (!payout) {
      throw new NotFoundException('Payout request not found');
    }

    if (payout.status !== 'pending') {
      throw new BadRequestException('Only pending payouts can be approved');
    }

    payout.status = 'approved';
    payout.approvedBy = adminId as any;
    payout.approvedAt = new Date();
    if (processDto.transactionReference) {
      payout.transactionReference = processDto.transactionReference;
    }
    if (processDto.adminNotes) {
      payout.adminNotes = processDto.adminNotes;
    }
    await payout.save();

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'payout.approved',
      module: 'payments',
      targetId: payoutId,
      targetType: 'PayoutRequest',
      status: 'success',
      details: {
        amount: payout.amount,
        astrologerId: payout.astrologerId.toString(),
      },
    });

    // Notify astrologer
    await this.notificationService.sendNotification({
      recipientId: payout.astrologerId.toString(),
      recipientModel: 'Astrologer',
      type: 'payout_approved',
      title: 'Payout Approved ✅',
      message: `Your payout request of ₹${payout.amount} has been approved and will be processed soon.`,
      priority: 'high',
    });

    this.logger.log(`✅ Payout approved: ${payoutId} | Amount: ₹${payout.amount}`);

    return {
      success: true,
      message: 'Payout approved successfully. It will be processed shortly.',
      data: payout,
    };
  }

  /**
   * Process payout (approved → processing)
   * ❌ Does NOT deduct money yet
   */
  async processPayout(payoutId: string, adminId: string, processDto: ProcessPayoutDto): Promise<any> {
    const payout = await this.payoutModel.findOne({ payoutId });
    if (!payout) {
      throw new NotFoundException('Payout request not found');
    }

    if (payout.status !== 'approved') {
      throw new BadRequestException('Only approved payouts can be processed');
    }

    payout.status = 'processing';
    payout.processedAt = new Date();
    if (processDto.transactionReference) {
      payout.transactionReference = processDto.transactionReference;
    }
    if (processDto.adminNotes) {
      payout.adminNotes = processDto.adminNotes;
    }
    await payout.save();

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'payout.processing',
      module: 'payments',
      targetId: payoutId,
      targetType: 'PayoutRequest',
      status: 'success',
      details: {
        amount: payout.amount,
        transactionReference: processDto.transactionReference,
      },
    });

    // Notify astrologer
    await this.notificationService.sendNotification({
      recipientId: payout.astrologerId.toString(),
      recipientModel: 'Astrologer',
      type: 'payout_processing',
      title: 'Payout Processing 🔄',
      message: `Your payout of ₹${payout.amount} is being processed. Money will be credited soon.`,
      priority: 'low',
    });

    this.logger.log(`🔄 Payout processing: ${payoutId} | Amount: ₹${payout.amount}`);

    return {
      success: true,
      message: 'Payout marked as processing',
      data: payout,
    };
  }

  /**
   * Complete payout (processing → completed)
   * ✅ THIS DEDUCTS MONEY FROM ASTROLOGER BALANCE
   */
  async completePayout(
    payoutId: string,
    adminId: string,
    completeDto: CompletePayoutDto,
  ): Promise<any> {
    const payout = await this.payoutModel.findOne({ payoutId });
    if (!payout) {
      throw new NotFoundException('Payout request not found');
    }

    if (payout.status !== 'processing') {
      throw new BadRequestException('Only processing payouts can be completed');
    }

    // ✅ Get astrologer to verify balance
    const astrologer = await this.astrologerModel.findById(payout.astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    // ✅ Double-check withdrawable amount
    if (astrologer.earnings.withdrawableAmount < payout.amount) {
      throw new BadRequestException(
        `Insufficient balance. Available: ₹${astrologer.earnings.withdrawableAmount}, Required: ₹${payout.amount}`
      );
    }

    // ✅ Update payout status
    payout.status = 'completed';
    payout.completedAt = new Date();
    payout.transactionReference = completeDto.transactionReference;
    if (completeDto.adminNotes) {
      payout.adminNotes = completeDto.adminNotes;
    }
    await payout.save();

    // ✅ Deduct from astrologer earnings
    const previousWithdrawable = astrologer.earnings.withdrawableAmount;
    const previousWithdrawn = astrologer.earnings.totalWithdrawn || 0;
    const previousPending = astrologer.earnings.pendingWithdrawal || 0;

    astrologer.earnings.totalWithdrawn = previousWithdrawn + payout.amount;
    astrologer.earnings.pendingWithdrawal = Math.max(0, previousPending - payout.amount);
    astrologer.earnings.withdrawableAmount = Math.max(0, previousWithdrawable - payout.amount);
    astrologer.earnings.lastUpdated = new Date();

    await astrologer.save();

    // ✅ Log activity
    await this.activityLogService.log({
      adminId,
      action: 'payout.completed',
      module: 'payments',
      targetId: payoutId,
      targetType: 'PayoutRequest',
      status: 'success',
      details: {
        amount: payout.amount,
        astrologerId: payout.astrologerId.toString(),
        transactionReference: completeDto.transactionReference,
        previousBalance: previousWithdrawable,
        newBalance: astrologer.earnings.withdrawableAmount,
      },
    });

    // ✅ Notify astrologer
    await this.notificationService.sendNotification({
      recipientId: payout.astrologerId.toString(),
      recipientModel: 'Astrologer',
      type: 'payout_completed',
      title: 'Payout Completed 💰',
      message: `Your payout of ₹${payout.amount} has been successfully transferred to your bank account.`,
      priority: 'high',
    });

    this.logger.log(
      `✅ Payout completed: ${payoutId} | Amount: ₹${payout.amount} | Ref: ${completeDto.transactionReference}`
    );

    return {
      success: true,
      message: 'Payout completed successfully. Amount deducted from astrologer balance.',
      data: {
        payout,
        astrologerBalance: {
          previousWithdrawable,
          newWithdrawable: astrologer.earnings.withdrawableAmount,
          totalWithdrawn: astrologer.earnings.totalWithdrawn,
        },
      },
    };
  }

  /**
   * Reject payout
   */
  async rejectPayout(payoutId: string, adminId: string, reason: string): Promise<any> {
    const payout = await this.payoutModel.findOne({ payoutId });
    if (!payout) {
      throw new NotFoundException('Payout request not found');
    }

    if (payout.status !== 'pending' && payout.status !== 'approved') {
      throw new BadRequestException('Cannot reject this payout');
    }

    payout.status = 'rejected';
    payout.rejectedAt = new Date();

    payout.rejectionReason = reason;
    await payout.save();

    // Log activity
    await this.activityLogService.log({
      adminId,
      action: 'payout.rejected',
      module: 'payments',
      targetId: payoutId,
      targetType: 'PayoutRequest',
      status: 'success',
      details: {
        amount: payout.amount,
        reason,
      },
    });

    // Notify astrologer
    await this.notificationService.sendNotification({
      recipientId: payout.astrologerId.toString(),
      recipientModel: 'Astrologer',
      type: 'payout_rejected',
      title: 'Payout Rejected ❌',
      message: `Your payout request has been rejected. Reason: ${reason}`,
      priority: 'high',
    });

    this.logger.log(`❌ Payout rejected: ${payoutId} | Reason: ${reason}`);

    return {
      success: true,
      message: 'Payout rejected',
      data: payout,
    };
  }

  /**
   * Get payout statistics
   */
  async getPayoutStats(): Promise<any> {
    const [total, pending, approved, rejected, totalAmount] = await Promise.all([
      this.payoutModel.countDocuments(),
      this.payoutModel.countDocuments({ status: 'pending' }),
      this.payoutModel.countDocuments({ status: { $in: ['approved', 'completed'] } }),
      this.payoutModel.countDocuments({ status: 'rejected' }),
      this.payoutModel.aggregate([
        { $match: { status: { $in: ['approved', 'completed'] } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    return {
      success: true,
      data: {
        total,
        pending,
        approved,
        rejected,
        totalAmount: totalAmount[0]?.total || 0,
      },
    };
  }

  // ===== WALLET REFUNDS =====

  /**
   * List wallet refund requests
   */
  async listWalletRefundRequests(
    page: number = 1,
    limit: number = 50,
    filters?: { status?: string; userId?: string },
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters?.status) query.status = filters.status;
    if (filters?.userId) query.userId = filters.userId;

    const [requests, total] = await Promise.all([
      this.walletRefundModel
        .find(query)
        .populate('userId', 'name phoneNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.walletRefundModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        requests,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  /**
   * Get wallet refund details
   */
  async getWalletRefundDetails(refundId: string): Promise<any> {
    const request = await this.walletRefundModel
      .findOne({ refundId })
      .populate('userId', 'name phoneNumber')
      .lean();

    if (!request) {
      throw new NotFoundException('Wallet refund request not found');
    }

    return {
      success: true,
      data: request,
    };
  }

  /**
   * Process wallet refund
   */
  async processWalletRefund(
    refundId: string,
    adminId: string,
    payload: ProcessWalletRefundDto,
  ): Promise<any> {
    const result = await this.walletService.processWalletRefund(
      refundId,
      adminId,
      payload,
    );

    await this.activityLogService.log({
      adminId,
      action: 'walletRefund.processed',
      module: 'payments',
      targetId: refundId,
      targetType: 'WalletRefundRequest',
      status: 'success',
      details: {
        amountApproved: payload.amountApproved,
        paymentReference: payload.paymentReference,
      },
    });

    return result;
  }

  // ===== GIFT CARDS =====

  /**
   * Create gift card
   */
  async createGiftCard(params: {
    code: string;
    amount: number;
    currency?: string;
    maxRedemptions?: number;
    expiresAt?: Date;
    metadata?: Record<string, any>;
    createdBy: string;
  }): Promise<any> {
    const normalizedCode = params.code.trim().toUpperCase();

    const existing = await this.giftCardModel.findOne({ code: normalizedCode });
    if (existing) {
      throw new BadRequestException('Gift card code already exists');
    }

    const giftCard = new this.giftCardModel({
      code: normalizedCode,
      amount: params.amount,
      currency: params.currency || 'INR',
      maxRedemptions: params.maxRedemptions ?? 1,
      status: 'active',
      expiresAt: params.expiresAt,
      createdBy: params.createdBy,
      metadata: params.metadata,
    });

    await giftCard.save();

    await this.activityLogService.log({
      adminId: params.createdBy,
      action: 'giftcard.created',
      module: 'payments',
      targetId: giftCard.code,
      targetType: 'GiftCard',
      status: 'success',
      details: {
        amount: giftCard.amount,
        currency: giftCard.currency,
        maxRedemptions: giftCard.maxRedemptions,
      },
    });

    this.logger.log(`Gift card created: ${giftCard.code} | Amount: ₹${giftCard.amount}`);

    return {
      success: true,
      message: 'Gift card created successfully',
      data: giftCard,
    };
  }

  /**
   * List gift cards
   */
  async listGiftCards(
    page: number = 1,
    limit: number = 50,
    filters?: { status?: string; search?: string },
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.search) {
      const term = filters.search.trim().toUpperCase();
      query.code = { $regex: term, $options: 'i' };
    }

    const [giftCards, total] = await Promise.all([
      this.giftCardModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.giftCardModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        giftCards,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  /**
   * Get gift card
   */
  async getGiftCard(code: string): Promise<any> {
    const normalizedCode = code.trim().toUpperCase();

    const giftCard = await this.giftCardModel
      .findOne({ code: normalizedCode })
      .lean();

    if (!giftCard) {
      throw new NotFoundException('Gift card not found');
    }

    return {
      success: true,
      data: giftCard,
    };
  }

  /**
   * Update gift card status
   */
  async updateGiftCardStatus(
    code: string,
    adminId: string,
    status: 'active' | 'disabled' | 'expired',
  ): Promise<any> {
    const normalizedCode = code.trim().toUpperCase();

    const giftCard = await this.giftCardModel.findOne({ code: normalizedCode });
    if (!giftCard) {
      throw new NotFoundException('Gift card not found');
    }

    giftCard.status = status;
    await giftCard.save();

    await this.activityLogService.log({
      adminId,
      action: 'giftcard.status_updated',
      module: 'payments',
      targetId: giftCard.code,
      targetType: 'GiftCard',
      status: 'success',
      details: { status },
    });

    this.logger.log(`Gift card status updated: ${giftCard.code} | Status: ${status}`);

    return {
      success: true,
      message: 'Gift card status updated',
      data: { code: giftCard.code, status: giftCard.status },
    };
  }

  async refundRazorpayTransaction(transactionId: string, adminId: string, reason: string) {
      // Delegate to WalletService
      return this.walletService.refundRazorpayTransaction(transactionId, adminId, reason);
  }

  async manageUserBonus(userId: string, amount: number, action: 'add' | 'deduct', reason: string, adminId: string) {
      return this.walletService.manageUserBonus(userId, amount, action, reason, adminId);
  }
}
