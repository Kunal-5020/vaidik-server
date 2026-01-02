import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(AdminAnalyticsService.name);

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
      
      // Call Commissions
      this.callSessionModel.aggregate([
        { $match: { status: 'ended' } },
        { $group: { _id: null, commission: { $sum: '$platformCommission' } } }
      ]),

      // Chat Commissions
      this.chatSessionModel.aggregate([
        { $match: { status: 'ended' } },
        { $group: { _id: null, commission: { $sum: '$platformCommission' } } }
      ]),

      // Bonus Usage (Deductions)
      this.transactionModel.aggregate([
        { 
          $match: { 
            type: 'debit', 
            $or: [{ subType: 'bonus' }, { subType: 'gift_card' }] 
          } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),

      // Penalties (Add to Revenue)
      this.astrologerModel.aggregate([
        { $unwind: '$penalties' },
        { $match: { 'penalties.status': 'applied' } },
        { $group: { _id: null, total: { $sum: '$penalties.amount' } } }
      ])
    ]);

    const grossCommission = (callStats[0]?.commission || 0) + (chatStats[0]?.commission || 0);
    const totalPenalties = penalties[0]?.total || 0;
    const bonusDeductions = bonusUsage[0]?.total || 0;
    
    // Net Revenue = (Commissions + Penalties) - Bonus Usage
    const netRevenue = (grossCommission + totalPenalties) - bonusDeductions;

    return {
      success: true,
      data: {
        totalUsers,
        totalAstrologers,
        totalOrders,
        financials: {
          grossCommission,
          netRevenue, 
          bonusDeductions,
          penaltiesCollected: totalPenalties
        }
      },
    };
  }

  /**
   * ✅ GET REVENUE ANALYTICS (ROBUST)
   * Merges multiple data sources and ensures continuous timeline
   */
  async getRevenueAnalytics(startDate: string, endDate: string): Promise<any> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // ✅ Include the full end day

    // 1. Aggregations (Full Code Restored)
    const callRevenue = await this.callSessionModel.aggregate([
      {
        $match: {
          status: 'ended',
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          commission: { $sum: "$platformCommission" },
          count: { $sum: 1 }
        }
      }
    ]);

    const chatRevenue = await this.chatSessionModel.aggregate([
      {
        $match: {
          status: 'ended',
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          commission: { $sum: "$platformCommission" },
          count: { $sum: 1 }
        }
      }
    ]);

    const bonusDeductions = await this.transactionModel.aggregate([
      {
        $match: {
          status: 'completed',
          // Matches your WalletTransaction schema types for 'deductions'
          type: { $in: ['bonus', 'giftcard', 'admin_credit'] }, 
          createdAt: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          amount: { $sum: "$amount" }
        }
      }
    ]);

    // 2. Data Merging Structure
    interface DailyStats {
      date: string;
      gross: number;
      deductions: number;
      net: number;
      orders: number;
    }

    const dateMap = new Map<string, DailyStats>();

    // Helper to initialize day
    const getDayObj = (date: string): DailyStats => {
      if (!dateMap.has(date)) {
        dateMap.set(date, { date, gross: 0, deductions: 0, net: 0, orders: 0 });
      }
      return dateMap.get(date)!;
    };

    // Populate data
    [...callRevenue, ...chatRevenue].forEach(item => {
      if (!item._id) return;
      const obj = getDayObj(item._id);
      obj.gross += item.commission || 0;
      obj.orders += item.count || 0;
    });

    bonusDeductions.forEach(item => {
      if (!item._id) return;
      const obj = getDayObj(item._id);
      obj.deductions += Math.abs(item.amount || 0);
    });

    // 3. Fill Missing Dates (Continuous Timeline)
    const dailyData: DailyStats[] = [];
    
    // Clone start date to avoid mutation issues
    const current = new Date(start);
    
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      const data = dateMap.get(dateStr) || { date: dateStr, gross: 0, deductions: 0, net: 0, orders: 0 };
      
      // Net Calculation
      data.net = data.gross - data.deductions;
      
      dailyData.push(data);
      
      // Move to next day
      current.setDate(current.getDate() + 1);
    }

    return {
      success: true,
      data: dailyData
    };
  }
}