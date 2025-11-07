import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ShopifyOrderEntity, ShopifyOrderDocument } from '../../shopify/schemas/shopify-order.schema';
import { Remedy, RemedyDocument } from '../../remedies/schemas/remedies.schema';
import { Order, OrderDocument } from '../../orders/schemas/orders.schema';

@Injectable()
export class AdminMonitoringService {
  private readonly logger = new Logger(AdminMonitoringService.name);

  constructor(
    @InjectModel(ShopifyOrderEntity.name)
    private shopifyOrderModel: Model<ShopifyOrderDocument>,
    @InjectModel(Remedy.name)
    private remedyModel: Model<RemedyDocument>,
    @InjectModel(Order.name)
    private orderModel: Model<OrderDocument>,
  ) {}

  // ============ SHOPIFY ORDERS MONITORING ============

  /**
   * Get all synced Shopify orders with pagination
   */
  async getAllShopifyOrders(page: number = 1, limit: number = 20): Promise<any> {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.shopifyOrderModel
        .find({ isDeleted: false })
        .populate('userId', 'name email phone profileImage')
        .sort({ shopifyCreatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.shopifyOrderModel.countDocuments({ isDeleted: false }),
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
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      },
    };
  }

  /**
   * Get Shopify orders by status
   */
  async getShopifyOrdersByStatus(
    status: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<any> {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.shopifyOrderModel
        .find({
          $or: [
            { financialStatus: status },
            { fulfillmentStatus: status },
          ],
          isDeleted: false,
        })
        .populate('userId', 'name email phone')
        .sort({ shopifyCreatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.shopifyOrderModel.countDocuments({
        $or: [
          { financialStatus: status },
          { fulfillmentStatus: status },
        ],
        isDeleted: false,
      }),
    ]);

    return {
      success: true,
      data: {
        status,
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
   * Get Shopify orders dashboard statistics
   */
  async getShopifyOrdersStats(): Promise<any> {
    const [
      totalOrders,
      paidOrders,
      pendingOrders,
      fulfilledOrders,
      unfulfilled,
      totalRevenue,
      ordersByDate,
    ] = await Promise.all([
      this.shopifyOrderModel.countDocuments({ isDeleted: false }),
      this.shopifyOrderModel.countDocuments({
        financialStatus: 'paid',
        isDeleted: false,
      }),
      this.shopifyOrderModel.countDocuments({
        financialStatus: 'pending',
        isDeleted: false,
      }),
      this.shopifyOrderModel.countDocuments({
        fulfillmentStatus: 'fulfilled',
        isDeleted: false,
      }),
      this.shopifyOrderModel.countDocuments({
        fulfillmentStatus: { $ne: 'fulfilled' },
        isDeleted: false,
      }),
      this.shopifyOrderModel.aggregate([
        { $match: { isDeleted: false, financialStatus: 'paid' } },
        {
          $group: {
            _id: null,
            total: {
              $sum: { $toDouble: '$totalPrice' },
            },
          },
        },
      ]),
      this.shopifyOrderModel.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$shopifyCreatedAt',
              },
            },
            count: { $sum: 1 },
            revenue: { $sum: { $toDouble: '$totalPrice' } },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 30 },
      ]),
    ]);

    return {
      success: true,
      data: {
        summary: {
          totalOrders,
          paidOrders,
          pendingOrders,
          fulfilledOrders,
          unfulfilledOrders: unfulfilled,
          totalRevenue: totalRevenue[0]?.total || 0,
          averageOrderValue:
            totalOrders > 0 ? (totalRevenue[0]?.total || 0) / totalOrders : 0,
        },
        ordersByDate,
      },
    };
  }

  /**
   * Search Shopify orders
   */
  async searchShopifyOrders(query: string, page: number = 1, limit: number = 20): Promise<any> {
    const skip = (page - 1) * limit;

    const searchQuery = {
      $or: [
        { orderNumber: { $regex: query, $options: 'i' } },
        { customerName: { $regex: query, $options: 'i' } },
        { customerEmail: { $regex: query, $options: 'i' } },
        { customerPhone: { $regex: query, $options: 'i' } },
        { 'lineItems.productName': { $regex: query, $options: 'i' } },
      ],
      isDeleted: false,
    };

    const [orders, total] = await Promise.all([
      this.shopifyOrderModel
        .find(searchQuery)
        .populate('userId', 'name email')
        .sort({ shopifyCreatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.shopifyOrderModel.countDocuments(searchQuery),
    ]);

    return {
      success: true,
      data: {
        query,
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

  // ============ REMEDIES MONITORING ============

  /**
   * Get all remedies with pagination
   */
  async getAllRemedies(page: number = 1, limit: number = 20): Promise<any> {
    const skip = (page - 1) * limit;

    const [remedies, total] = await Promise.all([
      this.remedyModel
        .find({ isDeleted: false })
        .populate('userId', 'name email phone')
        .populate('astrologerId', 'name specializations ratings')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.remedyModel.countDocuments({ isDeleted: false }),
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
   * Get remedies by source type (manual vs shopify)
   */
  async getRemediesBySource(
    source: 'manual' | 'shopify_product',
    page: number = 1,
    limit: number = 20,
  ): Promise<any> {
    const skip = (page - 1) * limit;

    const [remedies, total] = await Promise.all([
      this.remedyModel
        .find({ remedySource: source, isDeleted: false })
        .populate('userId', 'name email')
        .populate('astrologerId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.remedyModel.countDocuments({
        remedySource: source,
        isDeleted: false,
      }),
    ]);

    return {
      success: true,
      data: {
        source,
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
   * Get remedies by status (suggested, accepted, rejected)
   */
  async getRemediesByStatus(
    status: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<any> {
    const skip = (page - 1) * limit;

    const [remedies, total] = await Promise.all([
      this.remedyModel
        .find({ status, isDeleted: false })
        .populate('userId', 'name email')
        .populate('astrologerId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.remedyModel.countDocuments({ status, isDeleted: false }),
    ]);

    return {
      success: true,
      data: {
        status,
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
   * Get remedies dashboard statistics
   */
  async getRemediesStats(): Promise<any> {
    const [
      totalRemedies,
      suggestedRemedies,
      acceptedRemedies,
      rejectedRemedies,
      manualRemedies,
      shopifyProductRemedies,
      purchasedRemedies,
      remediesByType,
      remediesByAstrologer,
    ] = await Promise.all([
      this.remedyModel.countDocuments({ isDeleted: false }),
      this.remedyModel.countDocuments({
        status: 'suggested',
        isDeleted: false,
      }),
      this.remedyModel.countDocuments({
        status: 'accepted',
        isDeleted: false,
      }),
      this.remedyModel.countDocuments({
        status: 'rejected',
        isDeleted: false,
      }),
      this.remedyModel.countDocuments({
        remedySource: 'manual',
        isDeleted: false,
      }),
      this.remedyModel.countDocuments({
        remedySource: 'shopify_product',
        isDeleted: false,
      }),
      this.remedyModel.countDocuments({
        isPurchased: true,
        isDeleted: false,
      }),
      this.remedyModel.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: {
              $cond: [
                '$shopifyProduct',
                '$shopifyProduct.type',
                '$type',
              ],
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]),
      this.remedyModel.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: '$astrologerId',
            astrologerName: { $first: '$astrologerName' },
            count: { $sum: 1 },
            accepted: {
              $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] },
            },
            rejected: {
              $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
            },
            purchased: {
              $sum: { $cond: [{ $eq: ['$isPurchased', true] }, 1, 0] },
            },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const acceptanceRate =
      totalRemedies > 0
        ? ((acceptedRemedies / totalRemedies) * 100).toFixed(2)
        : '0';
    const purchaseRate =
      totalRemedies > 0
        ? ((purchasedRemedies / totalRemedies) * 100).toFixed(2)
        : '0';

    return {
      success: true,
      data: {
        summary: {
          totalRemedies,
          suggestedRemedies,
          acceptedRemedies,
          rejectedRemedies,
          acceptanceRate: `${acceptanceRate}%`,
          manualRemedies,
          shopifyProductRemedies,
          purchasedRemedies,
          purchaseRate: `${purchaseRate}%`,
        },
        remediesByType,
        topAstrologers: remediesByAstrologer,
      },
    };
  }

  /**
   * Get purchase conversion tracking
   */
  async getPurchaseConversionTracking(): Promise<any> {
    const data = await this.remedyModel.aggregate([
      { $match: { isDeleted: false, remedySource: 'shopify_product' } },
      {
        $group: {
          _id: '$shopifyProduct.productName',
          productId: { $first: '$shopifyProduct.productId' },
          suggested: { $sum: 1 },
          purchased: {
            $sum: { $cond: [{ $eq: ['$isPurchased', true] }, 1, 0] },
          },
          accepted: {
            $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 1,
          productId: 1,
          suggested: 1,
          purchased: 1,
          accepted: 1,
          conversionRate: {
            $cond: [
              { $gt: ['$suggested', 0] },
              { $divide: [{ $multiply: ['$purchased', 100] }, '$suggested'] },
              0,
            ],
          },
          acceptanceRate: {
            $cond: [
              { $gt: ['$suggested', 0] },
              { $divide: [{ $multiply: ['$accepted', 100] }, '$suggested'] },
              0,
            ],
          },
        },
      },
      { $sort: { suggested: -1 } },
    ]);

    return {
      success: true,
      data: {
        conversionMetrics: data,
      },
    };
  }

  // ============ ASTROLOGER PERFORMANCE ============

  /**
   * Get astrologer performance metrics
   */
  async getAstrologerPerformance(astrologerId: string): Promise<any> {
    const astrologerObjectId = new Types.ObjectId(astrologerId);

    const [
      totalRemedies,
      suggestedRemedies,
      acceptedRemedies,
      purchasedRemedies,
      remediesBySource,
      remediesByType,
      avgAcceptanceRate,
    ] = await Promise.all([
      this.remedyModel.countDocuments({
        astrologerId: astrologerObjectId,
        isDeleted: false,
      }),
      this.remedyModel.countDocuments({
        astrologerId: astrologerObjectId,
        status: 'suggested',
        isDeleted: false,
      }),
      this.remedyModel.countDocuments({
        astrologerId: astrologerObjectId,
        status: 'accepted',
        isDeleted: false,
      }),
      this.remedyModel.countDocuments({
        astrologerId: astrologerObjectId,
        isPurchased: true,
        isDeleted: false,
      }),
      this.remedyModel.aggregate([
        { $match: { astrologerId: astrologerObjectId, isDeleted: false } },
        {
          $group: {
            _id: '$remedySource',
            count: { $sum: 1 },
          },
        },
      ]),
      this.remedyModel.aggregate([
        { $match: { astrologerId: astrologerObjectId, isDeleted: false } },
        {
          $group: {
            _id: {
              $cond: [
                '$shopifyProduct',
                '$shopifyProduct.type',
                '$type',
              ],
            },
            count: { $sum: 1 },
          },
        },
      ]),
      this.remedyModel.aggregate([
        { $match: { astrologerId: astrologerObjectId, isDeleted: false } },
        {
          $group: {
            _id: null,
            acceptance: {
              $avg: {
                $cond: [
                  { $eq: ['$status', 'accepted'] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    return {
      success: true,
      data: {
        astrologerId,
        summary: {
          totalRemedies,
          suggestedRemedies,
          acceptedRemedies,
          purchasedRemedies,
          acceptanceRate: totalRemedies > 0
            ? ((acceptedRemedies / totalRemedies) * 100).toFixed(2)
            : '0',
          purchaseConversion: totalRemedies > 0
            ? ((purchasedRemedies / totalRemedies) * 100).toFixed(2)
            : '0',
        },
        remediesBySource: remediesBySource.reduce(
          (acc, item) => {
            acc[item._id] = item.count;
            return acc;
          },
          {},
        ),
        remediesByType: remediesByType.reduce(
          (acc, item) => {
            acc[item._id] = item.count;
            return acc;
          },
          {},
        ),
      },
    };
  }

  // ============ ORDER & REMEDY LINKING ============

  /**
   * Get order with all its suggested remedies
   */
  async getOrderWithRemedies(orderId: string): Promise<any> {
    const [order, remedies] = await Promise.all([
      this.orderModel.findOne({ orderId, isDeleted: false }).lean(),
      this.remedyModel
        .find({ orderId, isDeleted: false })
        .populate('astrologerId', 'name specializations')
        .lean(),
    ]);

    if (!order) {
      return {
        success: false,
        message: 'Order not found',
      };
    }

    return {
      success: true,
      data: {
        order,
        remedies,
        remediesCount: remedies.length,
        acceptedCount: remedies.filter(
          (r) => r.status === 'accepted',
        ).length,
        purchasedCount: remedies.filter((r) => r.isPurchased).length,
      },
    };
  }

  /**
   * Get user's journey: orders -> remedies -> purchases
   */
  async getUserJourney(userId: string): Promise<any> {
    const userObjectId = new Types.ObjectId(userId);

    const [consultationOrders, remedies, shopifyOrders] = await Promise.all([
      this.orderModel
        .find({ userId: userObjectId, isDeleted: false })
        .select('orderId type astrologerName totalAmount status createdAt')
        .sort({ createdAt: -1 })
        .lean(),
      this.remedyModel
        .find({ userId: userObjectId, isDeleted: false })
        .select('orderId remedySource title shopifyProduct.productName status isPurchased')
        .sort({ createdAt: -1 })
        .lean(),
      this.shopifyOrderModel
        .find({ userId: userObjectId, isDeleted: false })
        .select('orderNumber totalPrice currency shopifyCreatedAt')
        .sort({ shopifyCreatedAt: -1 })
        .lean(),
    ]);

    return {
      success: true,
      data: {
        userId,
        consultationOrders: {
          count: consultationOrders.length,
          orders: consultationOrders,
        },
        remediesSuggested: {
          count: remedies.length,
          accepted: remedies.filter((r) => r.status === 'accepted').length,
          purchased: remedies.filter((r) => r.isPurchased).length,
          remedies,
        },
        shopifyPurchases: {
          count: shopifyOrders.length,
          orders: shopifyOrders,
        },
      },
    };
  }

  // ============ SYSTEM HEALTH ============

  /**
   * Get system health and sync status
   */
  async getSystemHealth(): Promise<any> {
    const [
      totalShopifyOrders,
      totalRemedies,
      totalConsultationOrders,
      shopifyOrdersLast24h,
      remediesSuggestedLast24h,
      averageSyncTime,
    ] = await Promise.all([
      this.shopifyOrderModel.countDocuments({}),
      this.remedyModel.countDocuments({}),
      this.orderModel.countDocuments({}),
      this.shopifyOrderModel.countDocuments({
        syncedAt: {
          $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      }),
      this.remedyModel.countDocuments({
        createdAt: {
          $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      }),
      this.shopifyOrderModel.aggregate([
        {
          $group: {
            _id: null,
            avgSyncTime: {
              $avg: {
                $subtract: ['$syncedAt', '$shopifyUpdatedAt'],
              },
            },
          },
        },
      ]),
    ]);

    return {
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        collections: {
          shopifyOrders: totalShopifyOrders,
          remedies: totalRemedies,
          consultationOrders: totalConsultationOrders,
        },
        last24Hours: {
          shopifyOrdersSync: shopifyOrdersLast24h,
          remediesSuggested: remediesSuggestedLast24h,
        },
        averageSyncTime: {
          milliseconds: averageSyncTime[0]?.avgSyncTime || 0,
          seconds: ((averageSyncTime[0]?.avgSyncTime || 0) / 1000).toFixed(2),
        },
      },
    };
  }

  /**
 * Get single Shopify order details
 */
async getOrderDetails(orderId: string): Promise<any> {
  try {
    const order = await this.shopifyOrderModel.findById(orderId).lean();

    if (!order) {
      return {
        success: false,
        message: 'Order not found',
      };
    }

    return {
      success: true,
      data: order,
    };
  } catch (error: any) {
    this.logger.error(`Error fetching order details: ${error.message}`);
    throw error;
  }
}

/**
 * Get single remedy details
 */
async getRemedyDetails(remedyId: string): Promise<any> {
  try {
    const remedy = await this.remedyModel
      .findById(remedyId)
      .populate('userId', 'name email phone')
      .populate('astrologerId', 'name specializations')
      .lean();

    if (!remedy) {
      return {
        success: false,
        message: 'Remedy not found',
      };
    }

    return {
      success: true,
      data: remedy,
    };
  } catch (error: any) {
    this.logger.error(`Error fetching remedy details: ${error.message}`);
    throw error;
  }
}

}
