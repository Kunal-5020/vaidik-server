import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User, UserDocument } from '../../../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../../../astrologers/schemas/astrologer.schema';
import { Order, OrderDocument } from '../../../../orders/schemas/orders.schema';
import { CallSession, CallSessionDocument } from '../../../../calls/schemas/call-session.schema';
import { ChatSession, ChatSessionDocument } from '../../../../chat/schemas/chat-session.schema';
import { WalletTransaction, WalletTransactionDocument } from '../../../../payments/schemas/wallet-transaction.schema';

@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(CallSession.name) private callSessionModel: Model<CallSessionDocument>,
    @InjectModel(ChatSession.name) private chatSessionModel: Model<ChatSessionDocument>,
    @InjectModel(WalletTransaction.name) private transactionModel: Model<WalletTransactionDocument>,
  ) {}

  async getDashboardAnalytics(): Promise<any> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      totalAstrologers,
      totalOrders,
      callStats,
      chatStats,
      bonusUsage,
      penalties
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.astrologerModel.countDocuments(),
      this.orderModel.countDocuments(),
      
      // Aggregate Call Revenue (Platform Commission)
      this.callSessionModel.aggregate([
        { $match: { status: 'ended' } },
        { $group: { _id: null, commission: { $sum: '$platformCommission' } } }
      ]),

      // Aggregate Chat Revenue (Platform Commission)
      this.chatSessionModel.aggregate([
        { $match: { status: 'ended' } },
        { $group: { _id: null, commission: { $sum: '$platformCommission' } } }
      ]),

      // Calculate Bonus & Gift Usage (Non-Real Money)
      this.transactionModel.aggregate([
        { 
          $match: { 
            type: 'debit', 
            $or: [{ subType: 'bonus' }, { subType: 'gift_card' }] 
          } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),

      // Calculate Penalties Collected
      this.astrologerModel.aggregate([
        { $unwind: '$penalties' },
        { $match: { 'penalties.status': 'applied' } },
        { $group: { _id: null, total: { $sum: '$penalties.amount' } } }
      ])
    ]);

    // Revenue Calculation Logic
    const callCommission = callStats[0]?.commission || 0;
    const chatCommission = chatStats[0]?.commission || 0;
    const totalBonusUsed = bonusUsage[0]?.total || 0;
    const totalPenalties = penalties[0]?.total || 0;

    // Actual Revenue = (Commissions from Calls/Chats) + Penalties - (Bonus/Gifts Costs)
    const netRevenue = (callCommission + chatCommission + totalPenalties) - totalBonusUsed;

    return {
      success: true,
      data: {
        totalUsers,
        totalAstrologers,
        totalOrders,
        financials: {
          grossCommission: callCommission + chatCommission,
          netRevenue: Math.max(0, netRevenue), // Ensure we don't show negative if data is sparse
          bonusDeductions: totalBonusUsed,
          penaltiesCollected: totalPenalties
        }
      },
    };
  }
}