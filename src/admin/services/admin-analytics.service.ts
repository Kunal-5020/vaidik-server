import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { Order, OrderDocument } from '../../orders/schemas/orders.schema';
import { WalletTransaction, WalletTransactionDocument } from '../../payments/schemas/wallet-transaction.schema';

@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(WalletTransaction.name) private transactionModel: Model<WalletTransactionDocument>,
  ) {}

  async getDashboardStats(): Promise<any> {
    const [
      totalUsers,
      totalAstrologers,
      totalOrders,
      completedOrders,
      totalRevenue,
      todayRevenue,
      activeUsers,
      activeAstrologers,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.astrologerModel.countDocuments(),
      this.orderModel.countDocuments(),
      this.orderModel.countDocuments({ status: 'completed' }),
      this.orderModel.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      this.orderModel.aggregate([
        {
          $match: {
            status: 'completed',
            createdAt: {
              $gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      this.userModel.countDocuments({ accountStatus: 'active' }),
      this.astrologerModel.countDocuments({ accountStatus: 'active' }),
    ]);

    return {
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
        },
        astrologers: {
          total: totalAstrologers,
          active: activeAstrologers,
        },
        orders: {
          total: totalOrders,
          completed: completedOrders,
        },
        revenue: {
          total: totalRevenue[0]?.total || 0,
          today: todayRevenue[0]?.total || 0,
        },
      },
    };
  }

  async getRevenueAnalytics(startDate: Date, endDate: Date, groupBy?: string): Promise<any> {
    const revenueByDay = await this.orderModel.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          totalRevenue: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      success: true,
      data: revenueByDay,
    };
  }

  async getTopAstrologers(limit: number = 10): Promise<any> {
    const topAstrologers = await this.astrologerModel
      .find({ accountStatus: 'active' })
      .sort({ 'stats.totalEarnings': -1 })
      .limit(limit)
      .select('name profilePicture stats ratings')
      .lean();

    return {
      success: true,
      data: topAstrologers,
    };
  }

  async getUserGrowth(startDate: Date, endDate: Date): Promise<any> {
    const userGrowth = await this.userModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          newUsers: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      success: true,
      data: userGrowth,
    };
  }

  async getPerformanceMetrics(): Promise<any> {
    const metrics = {
      averageOrderValue: 0,
      userRetentionRate: 0,
      astrologerUtilization: 0,
    };

    return {
      success: true,
      data: metrics,
    };
  }
}
