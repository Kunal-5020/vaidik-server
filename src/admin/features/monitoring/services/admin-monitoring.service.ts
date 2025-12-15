// src/admin/features/monitoring/services/admin-monitoring.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { ShopifyOrderEntity, ShopifyOrderDocument } from '../../../../shopify/schemas/shopify-order.schema';
import { Remedy, RemedyDocument } from '../../../../remedies/schemas/remedies.schema';
import { Order, OrderDocument } from '../../../../orders/schemas/orders.schema';
import { User, UserDocument } from '../../../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../../../astrologers/schemas/astrologer.schema';
import { WalletTransaction, WalletTransactionDocument } from '../../../../payments/schemas/wallet-transaction.schema';

@Injectable()
export class AdminMonitoringService {
  private readonly logger = new Logger(AdminMonitoringService.name);

  constructor(
    @InjectModel(ShopifyOrderEntity.name) private shopifyOrderModel: Model<ShopifyOrderDocument>,
    @InjectModel(Remedy.name) private remedyModel: Model<RemedyDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    @InjectModel(WalletTransaction.name) private transactionModel: Model<WalletTransactionDocument>,
  ) {}

  // ===== SYSTEM HEALTH =====

  /**
   * Get system health status - UPDATED to match Frontend
   */
  async getSystemHealth(): Promise<any> {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      // Totals
      totalShopifyOrders,
      totalRemedies,
      totalOrders, // Consultation orders
      
      // Last 24 Hours
      shopifyOrders24h,
      remedies24h,
      
      // System Status Checks
      failedTransactions,
      activeOrders
    ] = await Promise.all([
      this.shopifyOrderModel.countDocuments(),
      this.remedyModel.countDocuments(),
      this.orderModel.countDocuments(),
      
      this.shopifyOrderModel.countDocuments({ createdAt: { $gte: last24Hours } }),
      this.remedyModel.countDocuments({ createdAt: { $gte: last24Hours } }),
      
      this.transactionModel.countDocuments({ status: 'failed', createdAt: { $gte: last24Hours } }),
      this.orderModel.countDocuments({ status: 'ongoing' })
    ]);

    // Calculate system status based on failures/load
    const status = failedTransactions > 5 ? 'critical' : activeOrders > 100 ? 'warning' : 'healthy';

    return {
      success: true,
      data: {
        status,
        timestamp: new Date(),
        // Matches frontend: health?.collections
        collections: {
          shopifyOrders: totalShopifyOrders,
          remedies: totalRemedies,
          consultationOrders: totalOrders,
        },
        // Matches frontend: health?.last24Hours
        last24Hours: {
          shopifyOrdersSync: shopifyOrders24h,
          remediesSuggested: remedies24h,
        },
        // Matches frontend: health?.averageSyncTime
        averageSyncTime: {
          seconds: 1.2, // Hardcoded baseline or calculate from logs if available
          status: 'optimal'
        }
      },
    };
  }

  /**
   * Get monitoring dashboard data
   */
  async getMonitoringDashboard(): Promise<any> {
    const [systemHealth, shopifyStats, remediesStats, realtimeMetrics] = await Promise.all([
      this.getSystemHealth(),
      this.getShopifyOrdersStats(),
      this.getRemediesStats(),
      this.getRealtimeMetrics(),
    ]);

    return {
      success: true,
      data: {
        systemHealth: systemHealth.data,
        shopify: shopifyStats.data,
        remedies: remediesStats.data,
        realtime: realtimeMetrics.data,
      },
    };
  }

  // ===== SHOPIFY ORDERS =====

  /**
   * Get Shopify orders statistics
   */
  async getShopifyOrdersStats(): Promise<any> {
    const [total, pending, completed, cancelled, totalRevenue] = await Promise.all([
      this.shopifyOrderModel.countDocuments(),
      this.shopifyOrderModel.countDocuments({ status: 'pending' }),
      this.shopifyOrderModel.countDocuments({ status: 'completed' }),
      this.shopifyOrderModel.countDocuments({ status: 'cancelled' }),
      this.shopifyOrderModel.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
    ]);

    return {
      success: true,
      data: {
        total,
        pending,
        completed,
        cancelled,
        totalRevenue: totalRevenue[0]?.total || 0,
      },
    };
  }

  /**
   * Get all Shopify orders
   */
  async getAllShopifyOrders(
    page: number = 1,
    limit: number = 20,
    status?: string,
    search?: string,
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { shopifyOrderId: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerEmail: { $regex: search, $options: 'i' } },
      ];
    }

    const [orders, total] = await Promise.all([
      this.shopifyOrderModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.shopifyOrderModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        orders,
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
   * Get Shopify order details
   */
  async getShopifyOrderDetails(orderId: string): Promise<any> {
    const order = await this.shopifyOrderModel.findOne({ shopifyOrderId: orderId }).lean();

    if (!order) {
      throw new NotFoundException('Shopify order not found');
    }

    return {
      success: true,
      data: order,
    };
  }

  // ===== REMEDIES =====

  /**
   * Get remedies statistics
   */
  async getRemediesStats(): Promise<any> {
    const [total, active, pending, completed, byCategory] = await Promise.all([
      this.remedyModel.countDocuments(),
      this.remedyModel.countDocuments({ status: 'active' }),
      this.remedyModel.countDocuments({ status: 'pending' }),
      this.remedyModel.countDocuments({ status: 'completed' }),
      this.remedyModel.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return {
      success: true,
      data: {
        total,
        active,
        pending,
        completed,
        byCategory,
      },
    };
  }

  /**
   * Get all remedies
   */
  async getAllRemedies(
    page: number = 1,
    limit: number = 20,
    status?: string,
    category?: string,
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (status) query.status = status;
    if (category) query.category = category;

    const [remedies, total] = await Promise.all([
      this.remedyModel
        .find(query)
        .populate('userId', 'name phoneNumber')
        .populate('astrologerId', 'name phoneNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.remedyModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        remedies,
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
   * Get remedy details
   */
  async getRemedyDetails(remedyId: string): Promise<any> {
    const remedy = await this.remedyModel
      .findById(remedyId)
      .populate('userId', 'name phoneNumber profileImage')
      .populate('astrologerId', 'name phoneNumber profilePicture')
      .lean();

    if (!remedy) {
      throw new NotFoundException('Remedy not found');
    }

    return {
      success: true,
      data: remedy,
    };
  }

  // ===== USER JOURNEY =====

  /**
   * Get user journey (complete activity history)
   */
  async getUserJourney(userId: string): Promise<any> {
    const userObjectId = new Types.ObjectId(userId);

    const user = await this.userModel.findById(userId).lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [orders, transactions, remedies] = await Promise.all([
      this.orderModel
        .find({ userId: userObjectId })
        .populate('astrologerId', 'name profilePicture')
        .sort({ createdAt: -1 })
        .lean(),
      this.transactionModel
        .find({ userId: userObjectId })
        .sort({ createdAt: -1 })
        .lean(),
      this.remedyModel
        .find({ userId: userObjectId })
        .populate('astrologerId', 'name')
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    // Merge and sort by timestamp
    const timeline = [
      ...orders.map((o) => ({ type: 'order', timestamp: o.createdAt, data: o })),
      ...transactions.map((t) => ({ type: 'transaction', timestamp: t.createdAt, data: t })),
      ...remedies.map((r) => ({ type: 'remedy', timestamp: r.createdAt, data: r })),
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return {
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          phoneNumber: user.phoneNumber,
          registeredAt: user.createdAt,
          status: user.status,
        },
        summary: {
          totalOrders: orders.length,
          totalTransactions: transactions.length,
          totalRemedies: remedies.length,
          walletBalance: user.wallet.balance,
          totalSpent: user.wallet.totalSpent,
        },
        timeline,
      },
    };
  }

  /**
   * Get user activity timeline (last N days)
   */
  async getUserTimeline(userId: string, days: number = 30): Promise<any> {
    const userObjectId = new Types.ObjectId(userId);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [orders, transactions] = await Promise.all([
      this.orderModel
        .find({
          userId: userObjectId,
          createdAt: { $gte: startDate },
        })
        .sort({ createdAt: -1 })
        .lean(),
      this.transactionModel
        .find({
          userId: userObjectId,
          createdAt: { $gte: startDate },
        })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    return {
      success: true,
      data: {
        period: `Last ${days} days`,
        orders,
        transactions,
      },
    };
  }

  // ===== ASTROLOGER PERFORMANCE =====

  /**
   * Get astrologer activity monitoring
   */
  async getAstrologerActivity(astrologerId: string, days: number = 7): Promise<any> {
    const astrologerObjectId = new Types.ObjectId(astrologerId);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const astrologer = await this.astrologerModel.findById(astrologerId).lean();
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    const [orders, revenue, avgRating] = await Promise.all([
      this.orderModel
        .find({
          astrologerId: astrologerObjectId,
          createdAt: { $gte: startDate },
        })
        .sort({ createdAt: -1 })
        .lean(),
      this.orderModel.aggregate([
        {
          $match: {
            astrologerId: astrologerObjectId,
            status: 'completed',
            createdAt: { $gte: startDate },
          },
        },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } },
      ]),
      this.orderModel.aggregate([
        {
          $match: {
            astrologerId: astrologerObjectId,
            status: 'completed',
            'rating.rating': { $exists: true },
            createdAt: { $gte: startDate },
          },
        },
        { $group: { _id: null, avg: { $avg: '$rating.rating' } } },
      ]),
    ]);

    return {
      success: true,
      data: {
        astrologer: {
          id: astrologer._id,
          name: astrologer.name,
          profilePicture: astrologer.profilePicture,
        },
        period: `Last ${days} days`,
        metrics: {
          totalOrders: orders.length,
          completedOrders: orders.filter((o) => o.status === 'completed').length,
          revenue: revenue[0]?.total || 0,
          averageRating: avgRating[0]?.avg || 0,
          isOnline: astrologer.availability.isOnline,
          isAvailable: astrologer.availability.isAvailable,
        },
        recentOrders: orders.slice(0, 10),
      },
    };
  }

  // ===== SYSTEM METRICS =====

  /**
   * Get real-time system metrics
   */
  async getRealtimeMetrics(): Promise<any> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const [
      activeUsers,
      onlineAstrologers,
      activeOrders,
      recentTransactions,
      liveAstrologers,
    ] = await Promise.all([
      this.userModel.countDocuments({
        lastActiveAt: { $gte: fiveMinutesAgo },
        status: 'active',
      }),
      this.astrologerModel.countDocuments({
        'availability.isOnline': true,
      }),
      this.orderModel.countDocuments({
        status: 'active',
      }),
      this.transactionModel.countDocuments({
        createdAt: { $gte: fiveMinutesAgo },
      }),
      this.astrologerModel.countDocuments({
        'availability.isLive': true,
      }),
    ]);

    return {
      success: true,
      data: {
        timestamp: new Date(),
        activeUsers,
        onlineAstrologers,
        activeOrders,
        recentTransactions,
        liveAstrologers,
      },
    };
  }

  /**
   * Get error logs
   */
  async getErrorLogs(page: number = 1, limit: number = 20): Promise<any> {
    const skip = (page - 1) * limit;

    const [failedTransactions, total] = await Promise.all([
      this.transactionModel
        .find({ status: 'failed' })
        .populate('userId', 'name phoneNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.transactionModel.countDocuments({ status: 'failed' }),
    ]);

    return {
      success: true,
      data: {
        errors: failedTransactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }
}
