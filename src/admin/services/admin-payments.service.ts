import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WalletTransaction, WalletTransactionDocument } from '../../payments/schemas/wallet-transaction.schema';
import { PayoutRequest, PayoutRequestDocument } from '../../payments/schemas/payout-request.schema';
import { AdminActivityLogService } from './admin-activity-log.service';
import { NotificationService } from '../../notifications/services/notification.service';

@Injectable()
export class AdminPaymentsService {
  constructor(
    @InjectModel(WalletTransaction.name) private transactionModel: Model<WalletTransactionDocument>,
    @InjectModel(PayoutRequest.name) private payoutModel: Model<PayoutRequestDocument>,
    private activityLogService: AdminActivityLogService,
    private notificationService: NotificationService,
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
    const [totalRecharge, totalSpent] = await Promise.all([
      this.transactionModel.aggregate([
        { $match: { type: 'recharge', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      this.transactionModel.aggregate([
        { $match: { type: 'deduction', status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);

    return {
      success: true,
      data: {
        totalRecharge: totalRecharge[0]?.total || 0,
        totalSpent: totalSpent[0]?.total || 0,
      },
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
