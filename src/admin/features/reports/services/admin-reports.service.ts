import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User, UserDocument } from '../../../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../../../astrologers/schemas/astrologer.schema';
import { Order, OrderDocument } from '../../../../orders/schemas/orders.schema';
import { WalletTransaction, WalletTransactionDocument } from '../../../../payments/schemas/wallet-transaction.schema';

@Injectable()
export class AdminReportsService {
  private readonly logger = new Logger(AdminReportsService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(WalletTransaction.name) private transactionModel: Model<WalletTransactionDocument>,
  ) {}

  /**
   * Get revenue report with time-based grouping
   */
  async getRevenueReport(startDate: string, endDate: string, groupBy: string = 'day'): Promise<any> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const groupStage = this.getGroupStage(groupBy);

    const revenueData = await this.orderModel.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: groupStage,
          totalRevenue: { $sum: '$totalAmount' },
          orderCount: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    const totalRevenue = revenueData.reduce((sum, item) => sum + item.totalRevenue, 0);
    const totalOrders = revenueData.reduce((sum, item) => sum + item.orderCount, 0);

    return {
      success: true,
      data: {
        revenueData,
        summary: {
          totalRevenue,
          totalOrders,
          avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        },
      },
    };
  }

  /**
   * Get user growth report
   */
  async getUserGrowthReport(startDate: string, endDate: string): Promise<any> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const growthData = await this.userModel.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          newUsers: { $sum: 1 },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    const totalNewUsers = growthData.reduce((sum, item) => sum + item.newUsers, 0);

    // Get status breakdown
    const statusBreakdown = await this.userModel.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    return {
      success: true,
      data: {
        growthData,
        statusBreakdown,
        summary: {
          totalNewUsers,
        },
      },
    };
  }

  /**
   * Get astrologer performance report
   */
  async getAstrologerPerformanceReport(startDate: string, endDate: string, limit: number = 10): Promise<any> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const performanceData = await this.orderModel.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: '$astrologerId',
          totalRevenue: { $sum: '$totalAmount' },
          totalOrders: { $sum: 1 },
          totalMinutes: { $sum: '$billedMinutes' },
          avgRating: { $avg: '$rating' },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'astrologers',
          localField: '_id',
          foreignField: '_id',
          as: 'astrologer',
        },
      },
      { $unwind: '$astrologer' },
      {
        $project: {
          _id: 1,
          totalRevenue: 1,
          totalOrders: 1,
          totalMinutes: 1,
          avgRating: 1,
          name: '$astrologer.name',
          phoneNumber: '$astrologer.phoneNumber',
          specializations: '$astrologer.specializations',
        },
      },
    ]);

    return {
      success: true,
      data: performanceData,
    };
  }

  /**
   * Get orders report
   */
  async getOrdersReport(startDate: string, endDate: string): Promise<any> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const [totalOrders, completedOrders, cancelledOrders, pendingOrders, totalRevenue, ordersByType] = await Promise.all([
      this.orderModel.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      this.orderModel.countDocuments({ status: 'completed', createdAt: { $gte: start, $lte: end } }),
      this.orderModel.countDocuments({ status: 'cancelled', createdAt: { $gte: start, $lte: end } }),
      this.orderModel.countDocuments({ status: 'pending', createdAt: { $gte: start, $lte: end } }),
      this.orderModel.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      this.orderModel.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
    ]);

    return {
      success: true,
      data: {
        totalOrders,
        completedOrders,
        cancelledOrders,
        pendingOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        completionRate: totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(2) : 0,
        ordersByType,
      },
    };
  }

  /**
   * Get payments report
   */
  async getPaymentsReport(startDate: string, endDate: string): Promise<any> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const [recharges, deductions, refunds, bonuses, giftcards] = await Promise.all([
      this.transactionModel.aggregate([
        { $match: { type: 'recharge', status: 'completed', createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      this.transactionModel.aggregate([
        { $match: { type: 'deduction', status: 'completed', createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      this.transactionModel.aggregate([
        { $match: { type: 'refund', status: 'completed', createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      this.transactionModel.aggregate([
        { $match: { type: 'bonus', status: 'completed', createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      this.transactionModel.aggregate([
        { $match: { type: 'giftcard', status: 'completed', createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    return {
      success: true,
      data: {
        recharges: { total: recharges[0]?.total || 0, count: recharges[0]?.count || 0 },
        deductions: { total: deductions[0]?.total || 0, count: deductions[0]?.count || 0 },
        refunds: { total: refunds[0]?.total || 0, count: refunds[0]?.count || 0 },
        bonuses: { total: bonuses[0]?.total || 0, count: bonuses[0]?.count || 0 },
        giftcards: { total: giftcards[0]?.total || 0, count: giftcards[0]?.count || 0 },
      },
    };
  }

  /**
   * Get comprehensive dashboard summary
   */
  async getDashboardSummary(startDate?: string, endDate?: string): Promise<any> {
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();

    const [users, astrologers, orders, revenue, payments] = await Promise.all([
      this.getUserGrowthReport(start.toISOString(), end.toISOString()),
      this.getAstrologerPerformanceReport(start.toISOString(), end.toISOString(), 5),
      this.getOrdersReport(start.toISOString(), end.toISOString()),
      this.getRevenueReport(start.toISOString(), end.toISOString(), 'day'),
      this.getPaymentsReport(start.toISOString(), end.toISOString()),
    ]);

    return {
      success: true,
      data: {
        users: users.data,
        astrologers: astrologers.data,
        orders: orders.data,
        revenue: revenue.data,
        payments: payments.data,
      },
    };
  }

  /**
   * Export revenue report as CSV
   */
  async exportRevenueReport(startDate: string, endDate: string): Promise<string> {
    const report = await this.getRevenueReport(startDate, endDate, 'day');
    
    let csv = 'Date,Total Revenue,Order Count,Avg Order Value\n';
    
    report.data.revenueData.forEach((row: any) => {
      const date = `${row._id.year}-${String(row._id.month).padStart(2, '0')}-${String(row._id.day).padStart(2, '0')}`;
      csv += `${date},${row.totalRevenue},${row.orderCount},${row.avgOrderValue.toFixed(2)}\n`;
    });
    
    csv += `\nSummary\n`;
    csv += `Total Revenue,${report.data.summary.totalRevenue}\n`;
    csv += `Total Orders,${report.data.summary.totalOrders}\n`;
    csv += `Avg Order Value,${report.data.summary.avgOrderValue.toFixed(2)}\n`;
    
    return csv;
  }

  /**
   * Export users report as CSV
   */
  async exportUsersReport(status?: string): Promise<string> {
    const query: any = {};
    if (status) query.status = status;

    const users = await this.userModel.find(query).select('name phoneNumber email status wallet.balance createdAt').lean();
    
    let csv = 'Name,Phone Number,Email,Status,Wallet Balance,Registered At\n';
    
    users.forEach((user) => {
      csv += `"${user.name || 'N/A'}",${user.phoneNumber},,${user.status},${user.wallet?.balance || 0},${new Date(user.createdAt).toISOString()}\n`;
    });
    
    return csv;
  }

  /**
   * Export astrologers report as CSV
   */
  async exportAstrologersReport(): Promise<string> {
    const astrologers = await this.astrologerModel
      .find()
      .select('name phoneNumber email accountStatus stats.totalEarnings stats.totalOrders ratings.average experienceYears')
      .lean();
    
    let csv = 'Name,Phone Number,Email,Status,Total Earnings,Total Orders,Avg Rating,Experience (Years)\n';
    
    astrologers.forEach((astro) => {
      csv += `"${astro.name}",${astro.phoneNumber},"${astro.email || 'N/A'}",${astro.accountStatus},${astro.stats?.totalEarnings || 0},${astro.stats?.totalOrders || 0},${(astro.ratings?.average || 0).toFixed(2)},${astro.experienceYears || 0}\n`;
    });
    
    return csv;
  }

  /**
   * Export orders report as CSV
   */
  async exportOrdersReport(startDate: string, endDate: string): Promise<string> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const orders = await this.orderModel
      .find({ createdAt: { $gte: start, $lte: end } })
      .populate('userId', 'name phoneNumber')
      .populate('astrologerId', 'name')
      .select('orderId type status totalAmount billedMinutes createdAt')
      .lean();
    
    let csv = 'Order ID,Type,Status,User Name,User Phone,Astrologer Name,Amount,Billed Minutes,Created At\n';
    
    orders.forEach((order: any) => {
      csv += `${order.orderId},${order.type},${order.status},"${order.userId?.name || 'N/A'}",${order.userId?.phoneNumber || 'N/A'},"${order.astrologerId?.name || 'N/A'}",${order.totalAmount},${order.billedMinutes || 0},${new Date(order.createdAt).toISOString()}\n`;
    });
    
    return csv;
  }

  /**
   * Helper: Get group stage for aggregation based on time period
   */
  private getGroupStage(groupBy: string) {
    switch (groupBy) {
      case 'month':
        return { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };
      case 'week':
        return { year: { $year: '$createdAt' }, week: { $week: '$createdAt' } };
      case 'day':
      default:
        return {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
        };
    }
  }
}
