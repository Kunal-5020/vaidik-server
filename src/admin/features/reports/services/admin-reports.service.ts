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
   * Helper: Get End of Day Date Object
   * Ensures the query covers the entire end day (up to 23:59:59.999)
   */
  private getEndOfDay(dateStr: string): Date {
    const date = new Date(dateStr);
    date.setHours(23, 59, 59, 999);
    return date;
  }

  /**
   * Helper: Get Start of Day Date Object
   */
  private getStartOfDay(dateStr: string): Date {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  /**
   * Helper: Get Case-Insensitive Status Regex
   * Fixes issues where 'Completed' vs 'completed' might cause empty results
   */
  private getStatusRegex(status: string) {
    return { $regex: new RegExp(`^${status}$`, 'i') };
  }

  /**
   * Get revenue report with time-based grouping
   */
  async getRevenueReport(startDate: string, endDate: string, groupBy: string = 'day'): Promise<any> {
    const start = this.getStartOfDay(startDate);
    const end = this.getEndOfDay(endDate);

    const groupStage = this.getGroupStage(groupBy);

    const revenueData = await this.orderModel.aggregate([
      {
        $match: {
          status: this.getStatusRegex('completed'),
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
    const start = this.getStartOfDay(startDate);
    const end = this.getEndOfDay(endDate);

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
    const start = this.getStartOfDay(startDate);
    const end = this.getEndOfDay(endDate);

    const performanceData = await this.orderModel.aggregate([
      {
        $match: {
          status: this.getStatusRegex('completed'),
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
      // ✅ FIX: Use preserveNullAndEmptyArrays to prevent dropping data if astrologer is deleted
      { $unwind: { path: '$astrologer', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          totalRevenue: 1,
          totalOrders: 1,
          totalMinutes: 1,
          avgRating: { $ifNull: ['$avgRating', 0] },
          // Provide defaults if lookup fails
          name: { $ifNull: ['$astrologer.name', 'Unknown Astrologer'] },
          phoneNumber: { $ifNull: ['$astrologer.phoneNumber', 'N/A'] },
          specializations: { $ifNull: ['$astrologer.specializations', []] },
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
    const start = this.getStartOfDay(startDate);
    const end = this.getEndOfDay(endDate);

    // Using Promise.all for parallel execution
    const [totalOrders, completedOrders, cancelledOrders, pendingOrders, totalRevenue, ordersByType] = await Promise.all([
      // 1. Total
      this.orderModel.countDocuments({ createdAt: { $gte: start, $lte: end } }),
      // 2. Completed (Case Insensitive)
      this.orderModel.countDocuments({ status: this.getStatusRegex('completed'), createdAt: { $gte: start, $lte: end } }),
      // 3. Cancelled (Case Insensitive)
      this.orderModel.countDocuments({ status: this.getStatusRegex('cancelled'), createdAt: { $gte: start, $lte: end } }),
      // 4. Pending (Case Insensitive)
      this.orderModel.countDocuments({ status: this.getStatusRegex('pending'), createdAt: { $gte: start, $lte: end } }),
      // 5. Total Revenue Aggregation
      this.orderModel.aggregate([
        { $match: { status: this.getStatusRegex('completed'), createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      // 6. Type Breakdown
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
    const start = this.getStartOfDay(startDate);
    const end = this.getEndOfDay(endDate);

    const getSum = async (matchCriteria: any) => {
      const res = await this.transactionModel.aggregate([
        { $match: { ...matchCriteria, createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]);
      return { total: res[0]?.total || 0, count: res[0]?.count || 0 };
    };

    const [recharges, deductions, refunds, bonuses, giftcards] = await Promise.all([
      getSum({ type: 'recharge', status: 'completed' }),
      // Deductions include multiple types
      getSum({ type: { $in: ['deduction', 'charge', 'session_payment'] }, status: 'completed' }),
      getSum({ type: 'refund', status: 'completed' }),
      getSum({ type: 'bonus', status: 'completed' }),
      getSum({ type: 'giftcard', status: 'completed' }),
    ]);

    return {
      success: true,
      data: {
        recharges,
        deductions,
        refunds,
        bonuses,
        giftcards,
      },
    };
  }

  /**
   * Get comprehensive dashboard summary
   */
  async getDashboardSummary(startDate?: string, endDate?: string): Promise<any> {
    const start = startDate ? this.getStartOfDay(startDate).toISOString() : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const end = endDate ? this.getEndOfDay(endDate).toISOString() : new Date().toISOString();

    const [users, astrologers, orders, revenue, payments] = await Promise.all([
      this.getUserGrowthReport(start, end),
      this.getAstrologerPerformanceReport(start, end, 5),
      this.getOrdersReport(start, end),
      this.getRevenueReport(start, end, 'day'),
      this.getPaymentsReport(start, end),
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

  // --- Export Methods ---
  
  async exportRevenueReport(startDate: string, endDate: string): Promise<string> {
    const report = await this.getRevenueReport(startDate, endDate, 'day');
    
    // Excel-friendly UTF-8 BOM
    let csv = '\uFEFFDate,Total Revenue,Order Count,Avg Order Value\n';
    
    report.data.revenueData.forEach((row: any) => {
      const date = `${row._id.year}-${String(row._id.month).padStart(2, '0')}-${String(row._id.day).padStart(2, '0')}`;
      csv += `${date},"${row.totalRevenue.toFixed(2)}","${row.orderCount}","${row.avgOrderValue.toFixed(2)}"\n`;
    });
    
    csv += `\nSummary\n`;
    csv += `Total Revenue,"${report.data.summary.totalRevenue.toFixed(2)}"\n`;
    csv += `Total Orders,"${report.data.summary.totalOrders}"\n`;
    
    return csv;
  }

  async exportUsersReport(status?: string): Promise<string> {
    const query: any = {};
    if (status) query.status = status;

    const users = await this.userModel.find(query)
      .select('name phoneNumber email status wallet.balance createdAt isPhoneVerified')
      .lean();
    
    let csv = '\uFEFFName,Phone Number,Email,Status,Verified,Wallet Balance,Registered At\n';
    
    users.forEach((user) => {
      const name = (user.name || 'N/A').replace(/"/g, '""');
      const phone = `="${user.phoneNumber}"`;
      
      csv += `"${name}",${phone},${user.status},${user.isPhoneVerified ? 'Yes' : 'No'},"${(user.wallet?.balance || 0).toFixed(2)}",${new Date(user.createdAt).toISOString()}\n`;
    });
    
    return csv;
  }

  async exportAstrologersReport(): Promise<string> {
    const astrologers = await this.astrologerModel
      .find()
      .select('name phoneNumber email accountStatus stats ratings experienceYears')
      .lean();
    
    let csv = '\uFEFFName,Phone Number,Email,Status,Total Earnings,Total Orders,Avg Rating,Experience (Years)\n';
    
    astrologers.forEach((astro) => {
      const name = (astro.name || 'N/A').replace(/"/g, '""');
      const phone = `="${astro.phoneNumber}"`;
      
      csv += `"${name}",${phone},"${astro.email || 'N/A'}",${astro.accountStatus},"${(astro.stats?.totalEarnings || 0).toFixed(2)}",${astro.stats?.totalOrders || 0},${(astro.ratings?.average || 0).toFixed(2)},${astro.experienceYears || 0}\n`;
    });
    
    return csv;
  }

  async exportOrdersReport(startDate: string, endDate: string): Promise<string> {
    const start = this.getStartOfDay(startDate);
    const end = this.getEndOfDay(endDate);

    const orders = await this.orderModel
      .find({ createdAt: { $gte: start, $lte: end } })
      .populate('userId', 'name phoneNumber')
      .populate('astrologerId', 'name')
      .select('orderId type status totalAmount billedMinutes createdAt')
      .sort({ createdAt: -1 })
      .lean();
    
    let csv = '\uFEFFOrder ID,Type,Status,User Name,User Phone,Astrologer Name,Amount,Billed Minutes,Created At\n';
    
    orders.forEach((order: any) => {
      const userName = (order.userId?.name || 'N/A').replace(/"/g, '""');
      const userPhone = `="${order.userId?.phoneNumber || 'N/A'}"`;
      const astroName = (order.astrologerId?.name || 'N/A').replace(/"/g, '""');

      csv += `${order.orderId},${order.type},${order.status},"${userName}",${userPhone},"${astroName}","${order.totalAmount.toFixed(2)}",${order.billedMinutes || 0},${new Date(order.createdAt).toISOString()}\n`;
    });
    
    return csv;
  }

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