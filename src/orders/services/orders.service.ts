import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Order, OrderDocument } from '../schemas/orders.schema';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
  ) {}

  // ===== CREATE ORDER =====

  async createOrder(orderData: {
    userId: string;
    astrologerId: string;
    astrologerName: string;
    type: 'call' | 'chat';
    ratePerMinute: number;
    sessionId: string;
  }): Promise<OrderDocument> {
    const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    const order = new this.orderModel({
      orderId,
      userId: orderData.userId,
      astrologerId: orderData.astrologerId,
      astrologerName: orderData.astrologerName,
      type: orderData.type,
      ratePerMinute: orderData.ratePerMinute,
      totalAmount: 0, // Will be updated when session ends
      status: 'pending',
      ...(orderData.type === 'call' && { callSessionId: orderData.sessionId }),
      ...(orderData.type === 'chat' && { chatSessionId: orderData.sessionId }),
      startTime: new Date()
    });

    await order.save();
    return order;
  }

  // ===== UPDATE ORDER =====

  async updateOrderStatus(
    orderId: string,
    status: 'ongoing' | 'completed' | 'cancelled'
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findOneAndUpdate(
      { orderId },
      { $set: { status } },
      { new: true }
    );

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async completeOrder(orderId: string, updateData: {
    duration: number;
    totalAmount: number;
    endTime: Date;
  }): Promise<OrderDocument> {
    const order = await this.orderModel.findOneAndUpdate(
      { orderId },
      {
        $set: {
          duration: updateData.duration,
          totalAmount: updateData.totalAmount,
          endTime: updateData.endTime,
          status: 'completed'
        }
      },
      { new: true }
    );

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  // ===== GET ORDERS =====

  async getUserOrders(
    userId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { type?: string; status?: string }
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = { userId };

    if (filters?.type) query.type = filters.type;
    if (filters?.status) query.status = filters.status;

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(query)
        .populate('astrologerId', 'name profilePicture experienceYears specializations ratings')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments(query)
    ]);

    return {
      success: true,
      data: {
        orders,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  async getAstrologerOrders(
    astrologerId: string,
    page: number = 1,
    limit: number = 20,
    filters?: { type?: string; status?: string }
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = { astrologerId };

    if (filters?.type) query.type = filters.type;
    if (filters?.status) query.status = filters.status;

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(query)
        .populate('userId', 'name profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments(query)
    ]);

    return {
      success: true,
      data: {
        orders,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  async getOrderDetails(orderId: string, userId: string): Promise<any> {
    const order = await this.orderModel
      .findOne({ orderId, userId })
      .populate('astrologerId', 'name profilePicture experienceYears specializations ratings pricing')
      .lean();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return {
      success: true,
      data: order
    };
  }

  // ===== ADD REVIEW =====

  async addReview(
    orderId: string,
    userId: string,
    rating: number,
    review?: string
  ): Promise<any> {
    const order = await this.orderModel.findOne({
      orderId,
      userId,
      status: 'completed'
    });

    if (!order) {
      throw new NotFoundException('Order not found or not completed');
    }

    if (order.reviewSubmitted) {
      throw new BadRequestException('Review already submitted for this order');
    }

    order.rating = rating;
    order.review = review || '';
    order.reviewSubmitted = true;
    await order.save();

    return {
      success: true,
      message: 'Review submitted successfully',
      data: {
        orderId: order.orderId,
        rating: order.rating,
        review: order.review
      }
    };
  }

  // ===== CANCEL ORDER =====

  async cancelOrder(
    orderId: string,
    userId: string,
    reason: string,
    cancelledBy: 'user' | 'astrologer' | 'system'
  ): Promise<any> {
    const order = await this.orderModel.findOne({
      orderId,
      userId,
      status: { $in: ['pending', 'ongoing'] }
    });

    if (!order) {
      throw new NotFoundException('Order not found or cannot be cancelled');
    }

    order.status = 'cancelled';
    order.cancellationReason = reason;
    order.cancelledBy = cancelledBy;
    order.cancelledAt = new Date();
    await order.save();

    return {
      success: true,
      message: 'Order cancelled successfully',
      data: order
    };
  }

  // ===== STATISTICS =====

  async getUserOrderStats(userId: string): Promise<any> {
    const [totalOrders, completedOrders, totalSpent, ordersByType] = await Promise.all([
      this.orderModel.countDocuments({ userId }),
      this.orderModel.countDocuments({ userId, status: 'completed' }),
      this.orderModel.aggregate([
        { $match: { userId: userId, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      this.orderModel.aggregate([
        { $match: { userId: userId } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ])
    ]);

    return {
      success: true,
      data: {
        totalOrders,
        completedOrders,
        totalSpent: totalSpent[0]?.total || 0,
        ordersByType: ordersByType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      }
    };
  }

  async getAstrologerOrderStats(astrologerId: string): Promise<any> {
    const [totalOrders, completedOrders, totalEarned, ordersByType] = await Promise.all([
      this.orderModel.countDocuments({ astrologerId }),
      this.orderModel.countDocuments({ astrologerId, status: 'completed' }),
      this.orderModel.aggregate([
        { $match: { astrologerId: astrologerId, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      this.orderModel.aggregate([
        { $match: { astrologerId: astrologerId } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ])
    ]);

    return {
      success: true,
      data: {
        totalOrders,
        completedOrders,
        totalEarned: totalEarned[0]?.total || 0,
        ordersByType: ordersByType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      }
    };
  }

  // ===== INTERNAL METHODS =====

  async findOrderBySessionId(sessionId: string, type: 'call' | 'chat'): Promise<OrderDocument | null> {
    const query = type === 'call' 
      ? { callSessionId: sessionId }
      : { chatSessionId: sessionId };
    
    return this.orderModel.findOne(query);
  }
}
