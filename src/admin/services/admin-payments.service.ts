import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WalletTransaction, WalletTransactionDocument } from '../../payments/schemas/wallet-transaction.schema';
import { PayoutRequest, PayoutRequestDocument } from '../../payments/schemas/payout-request.schema';
import { WalletRefundRequest, WalletRefundRequestDocument } from '../../payments/schemas/wallet-refund-request.schema';
import { GiftCard, GiftCardDocument } from '../../payments/schemas/gift-card.schema';
import { AdminActivityLogService } from './admin-activity-log.service';
import { NotificationService } from '../../notifications/services/notification.service';
import { WalletService } from '../../payments/services/wallet.service';

@Injectable()
export class AdminPaymentsService {
  constructor(
    @InjectModel(WalletTransaction.name) private transactionModel: Model<WalletTransactionDocument>,
    @InjectModel(PayoutRequest.name) private payoutModel: Model<PayoutRequestDocument>,
    @InjectModel(WalletRefundRequest.name) private walletRefundModel: Model<WalletRefundRequestDocument>,
    @InjectModel(GiftCard.name) private giftCardModel: Model<GiftCardDocument>,
    private activityLogService: AdminActivityLogService,
    private notificationService: NotificationService,
    private walletService: WalletService,
  ) {}

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
        .populate('userId', 'name phoneNumber email')
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
        .populate('astrologerId', 'name phoneNumber email')
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

  async getPendingPayouts(): Promise<any> {
    const payouts = await this.payoutModel
      .find({ status: 'pending' })
      .populate('astrologerId', 'name phoneNumber email')
      .sort({ createdAt: 1 })
      .lean();

    return {
      success: true,
      data: payouts,
    };
  }

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

  async approvePayout(payoutId: string, adminId: string, processDto: any): Promise<any> {
    const payout = await this.payoutModel.findOne({ payoutId });
    if (!payout) {
      throw new NotFoundException('Payout request not found');
    }

    payout.status = 'approved';
    payout.approvedBy = adminId as any;
    payout.approvedAt = new Date();
    payout.transactionReference = processDto.transactionReference;
    payout.adminNotes = processDto.adminNotes;
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
      type: 'payout_processed',
      title: 'Payout Approved',
      message: `Your payout request of ₹${payout.amount} has been approved.`,
      priority: 'high',
    });

    return {
      success: true,
      message: 'Payout approved successfully',
    };
  }

  async rejectPayout(payoutId: string, adminId: string, reason: string): Promise<any> {
    const payout = await this.payoutModel.findOne({ payoutId });
    if (!payout) {
      throw new NotFoundException('Payout request not found');
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
      type: 'payout_processed',
      title: 'Payout Rejected',
      message: `Your payout request has been rejected. Reason: ${reason}`,
      priority: 'high',
    });

    return {
      success: true,
      message: 'Payout rejected',
    };
  }

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

  // ===== WALLET REFUND REQUESTS (USER CASH-OUT) =====

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
        .populate('userId', 'name phoneNumber email')
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

  async getWalletRefundDetails(refundId: string): Promise<any> {
    const request = await this.walletRefundModel
      .findOne({ refundId })
      .populate('userId', 'name phoneNumber email')
      .lean();

    if (!request) {
      throw new NotFoundException('Wallet refund request not found');
    }

    return {
      success: true,
      data: request,
    };
  }

  async createWalletRefundRequest(
    userId: string,
    amount: number,
    reason: string,
  ): Promise<any> {
    const request = await this.walletService.createWalletRefundRequest(
      userId,
      amount,
      reason,
    );

    await this.activityLogService.log({
      adminId: undefined as any,
      action: 'walletRefund.requested',
      module: 'payments',
      targetId: request.refundId,
      targetType: 'WalletRefundRequest',
      status: 'success',
      details: {
        userId: request.userId.toString(),
        amountRequested: request.amountRequested,
      },
    });

    return {
      success: true,
      message: 'Wallet refund request created',
      data: request,
    };
  }

  async processWalletRefund(
    refundId: string,
    adminId: string,
    payload: { amountApproved: number; paymentReference: string },
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

  // ===== GIFT CARDS (ADMIN) =====

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
      throw new Error('Gift card code already exists');
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

    return {
      success: true,
      message: 'Gift card created successfully',
      data: giftCard,
    };
  }

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

    return {
      success: true,
      message: 'Gift card status updated',
      data: { code: giftCard.code, status: giftCard.status },
    };
  }

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
}
