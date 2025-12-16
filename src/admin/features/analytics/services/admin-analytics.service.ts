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
    // We allow negative values here so you can see if you are burning cash
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

  async getRevenueAnalytics(startDate: string, endDate: string): Promise<any> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Adjust end date to include the full day
    end.setHours(23, 59, 59, 999);

    // 1. Call Commissions per day
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

    // 2. Chat Commissions per day
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

    // 3. Bonus Deductions per day
    const bonusDeductions = await this.transactionModel.aggregate([
      {
        $match: {
          type: 'debit',
          $or: [{ subType: 'bonus' }, { subType: 'gift_card' }],
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

    // 4. Merge Data
    // Define exact type for the daily data object
    interface DailyStats {
      date: string;
      gross: number;
      deductions: number;
      net: number;
      orders: number;
    }

    const dailyData: DailyStats[] = [];
    const dateMap = new Map<string, DailyStats>();

    const getDayObj = (date: string): DailyStats => {
      if (!dateMap.has(date)) {
        dateMap.set(date, { date, gross: 0, deductions: 0, net: 0, orders: 0 });
      }
      return dateMap.get(date)!;
    };

    // Process Calls
    callRevenue.forEach(item => {
      const obj = getDayObj(item._id);
      obj.gross += item.commission || 0;
      obj.orders += item.count || 0;
    });

    // Process Chats
    chatRevenue.forEach(item => {
      const obj = getDayObj(item._id);
      obj.gross += item.commission || 0;
      obj.orders += item.count || 0;
    });

    // Process Bonuses (Subtract from Net)
    bonusDeductions.forEach(item => {
      const obj = getDayObj(item._id);
      obj.deductions += item.amount || 0;
    });

    // Finalize Calculation & Fill Gaps
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const data = dateMap.get(dateStr) || { date: dateStr, gross: 0, deductions: 0, net: 0, orders: 0 };
      
      // Net = Gross Commission - Bonus Deductions
      data.net = data.gross - data.deductions;
      
      dailyData.push(data);
    }

    return {
      success: true,
      data: dailyData.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    };
  }
}