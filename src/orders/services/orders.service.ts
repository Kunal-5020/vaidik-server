// src/orders/services/orders.service.ts

import { 
  Injectable, 
  NotFoundException, 
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../schemas/orders.schema';
import { WalletService } from '../../payments/services/wallet.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private walletService: WalletService, // ✅ Inject WalletService
  ) {}

  // ===== HELPER: Generate Order ID =====
  private generateOrderId(): string {
    return `ORD_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
  }

  // ===== HELPER: Convert to ObjectId =====
  private toObjectId(id: string): Types.ObjectId {
    try {
      return new Types.ObjectId(id);
    } catch (error) {
      throw new BadRequestException('Invalid ID format');
    }
  }

  // ===== CREATE ORDER =====
  async createOrder(orderData: {
    userId: string;
    astrologerId: string;
    astrologerName: string;
    type: 'call' | 'chat';
    callType?: 'audio' | 'video'; // For call orders
    ratePerMinute: number;
    sessionId: string;
  }): Promise<OrderDocument> {
    const orderId = this.generateOrderId();

    const orderPayload: any = {
      orderId,
      userId: this.toObjectId(orderData.userId),
      astrologerId: this.toObjectId(orderData.astrologerId),
      astrologerName: orderData.astrologerName,
      type: orderData.type,
      ratePerMinute: orderData.ratePerMinute,
      totalAmount: 0,
      status: 'pending',
      startTime: new Date(),
      isDeleted: false
    };

    // Add call-specific fields
    if (orderData.type === 'call') {
      orderPayload.callSessionId = orderData.sessionId;
      orderPayload.callType = orderData.callType || 'audio';
      orderPayload.hasRecording = false;
      orderPayload.recordingType = 'none';
    }

    // Add chat-specific fields
    if (orderData.type === 'chat') {
      orderPayload.chatSessionId = orderData.sessionId;
    }

    const order = new this.orderModel(orderPayload);
    await order.save();

    this.logger.log(`Order created: ${orderId} | Type: ${orderData.type} | User: ${orderData.userId}`);
    return order;
  }

  // ===== UPDATE ORDER STATUS =====
  async updateOrderStatus(
    orderId: string,
    status: 'ongoing' | 'completed' | 'cancelled'
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findOneAndUpdate(
      { orderId, isDeleted: false },
      { $set: { status } },
      { new: true }
    );

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.logger.log(`Order ${orderId} status updated to: ${status}`);
    return order;
  }

  // ===== COMPLETE ORDER =====
  async completeOrder(orderId: string, updateData: {
    duration: number;
    totalAmount: number;
    endTime: Date;
    recordingUrl?: string;
    recordingS3Key?: string;
    recordingDuration?: number;
  }): Promise<OrderDocument> {
    const order = await this.orderModel.findOne({ orderId, isDeleted: false });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Update order details
    order.duration = updateData.duration;
    order.totalAmount = updateData.totalAmount;
    order.endTime = updateData.endTime;
    order.status = 'completed';

    // ✅ Add recording details if available (for calls)
    if (updateData.recordingUrl) {
      order.hasRecording = true;
      order.recordingUrl = updateData.recordingUrl;
      order.recordingS3Key = updateData.recordingS3Key;
      order.recordingDuration = updateData.recordingDuration || updateData.duration;
      
      // Set recording type based on call type
      if (order.callType === 'audio') {
        order.recordingType = 'voice_note';
      } else if (order.callType === 'video') {
        order.recordingType = 'video';
      }
    }

    // Update payment status
    if (!order.payment) {
      order.payment = {
        paymentStatus: 'paid',
        paidAt: new Date()
      };
    } else {
      order.payment.paymentStatus = 'paid';
      order.payment.paidAt = new Date();
    }

    await order.save();

    this.logger.log(`Order completed: ${orderId} | Amount: ${updateData.totalAmount} | Recording: ${order.hasRecording}`);
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
    const query: any = { 
      userId: this.toObjectId(userId),
      isDeleted: false 
    };

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
          pages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
          nextPage: page < Math.ceil(total / limit) ? page + 1 : null,
          prevPage: page > 1 ? page - 1 : null
        }
      }
    };
  }

  async getOrderDetails(orderId: string, userId: string): Promise<any> {
    const order = await this.orderModel
      .findOne({ 
        orderId, 
        userId: this.toObjectId(userId),
        isDeleted: false 
      })
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

  // ✅ NEW: Get order recording (voice note or video)
  async getOrderRecording(orderId: string, userId: string): Promise<any> {
    const order = await this.orderModel
      .findOne({ 
        orderId, 
        userId: this.toObjectId(userId),
        isDeleted: false,
        hasRecording: true 
      })
      .select('orderId recordingUrl recordingType recordingDuration callType')
      .lean();

    if (!order) {
      throw new NotFoundException('Order not found or no recording available');
    }

    return {
      success: true,
      data: {
        orderId: order.orderId,
        recordingUrl: order.recordingUrl,
        recordingType: order.recordingType,
        recordingDuration: order.recordingDuration,
        callType: order.callType
      }
    };
  }

  // ===== REFUND SYSTEM =====

  async requestRefund(
    orderId: string,
    userId: string,
    reason: string
  ): Promise<any> {
    const order = await this.orderModel.findOne({
      orderId,
      userId: this.toObjectId(userId),
      status: 'completed',
      isDeleted: false
    });

    if (!order) {
      throw new NotFoundException('Order not found or not eligible for refund');
    }

    // Check if already refunded or refund requested
    if (order.status === 'refunded') {
      throw new BadRequestException('Order already refunded');
    }

    if (order.refundRequest && order.refundRequest.status === 'pending') {
      throw new BadRequestException('Refund request already submitted');
    }

    // Create refund request
    order.refundRequest = {
      requestedAt: new Date(),
      requestedBy: this.toObjectId(userId),
      reason,
      status: 'pending',
      refundAmount: order.totalAmount,
      refundPercentage: 100
    };

    order.status = 'refund_requested';
    await order.save();

    this.logger.log(`Refund requested: ${orderId} | User: ${userId} | Amount: ${order.totalAmount}`);

    return {
      success: true,
      message: 'Refund request submitted successfully',
      data: {
        orderId: order.orderId,
        refundAmount: order.totalAmount,
        status: 'pending'
      }
    };
  }


  // Get refund status
  async getRefundStatus(orderId: string, userId: string): Promise<any> {
    const order = await this.orderModel
      .findOne({ 
        orderId, 
        userId: this.toObjectId(userId),
        isDeleted: false 
      })
      .select('orderId status refundRequest payment')
      .lean();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!order.refundRequest) {
      return {
        success: true,
        data: {
          orderId: order.orderId,
          hasRefundRequest: false,
          status: order.status
        }
      };
    }

    return {
      success: true,
      data: {
        orderId: order.orderId,
        hasRefundRequest: true,
        refundStatus: order.refundRequest.status,
        requestedAt: order.refundRequest.requestedAt,
        refundAmount: order.refundRequest.refundAmount,
        reason: order.refundRequest.reason,
        processedAt: order.refundRequest.processedAt,
        adminNotes: order.refundRequest.adminNotes,
        rejectionReason: order.refundRequest.rejectionReason
      }
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
      userId: this.toObjectId(userId),
      status: 'completed',
      isDeleted: false
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
 // ✅ UPDATED: Cancel order (without transactions)
  async cancelOrder(
    orderId: string,
    userId: string,
    reason: string,
    cancelledBy: 'user' | 'astrologer' | 'system' | 'admin'
  ): Promise<any> {
    const order = await this.orderModel.findOne({
      orderId,
      userId: this.toObjectId(userId),
      status: { $in: ['pending', 'ongoing'] },
      isDeleted: false
    });

    if (!order) {
      throw new NotFoundException('Order not found or cannot be cancelled');
    }

    order.status = 'cancelled';
    order.cancellationReason = reason;
    order.cancelledBy = cancelledBy;
    order.cancelledAt = new Date();

    // If payment was made, trigger refund
    if (order.payment?.paymentStatus === 'paid' && order.totalAmount > 0) {
      try {
        const refundTxn = await this.walletService.creditToWallet(
          order.userId.toString(),
          order.totalAmount,
          orderId,
          `Refund for cancelled order ${orderId}`
        );

        order.payment.paymentStatus = 'refunded';
        order.payment.refundedAt = new Date();
        order.payment.refundAmount = order.totalAmount;
        order.payment.refundTransactionId = refundTxn.transactionId;
      } catch (error: any) {
        this.logger.error(`Failed to refund cancelled order: ${error.message}`);
      }
    }

    await order.save();

    this.logger.log(`Order cancelled: ${orderId} | By: ${cancelledBy}`);

    return {
      success: true,
      message: 'Order cancelled successfully',
      data: order
    };
  }

  // ===== STATISTICS =====
  async getUserOrderStats(userId: string): Promise<any> {
    const userObjectId = this.toObjectId(userId);

    const [
      totalOrders,
      completedOrders,
      totalSpent,
      ordersByType,
      ordersByStatus,
      totalRefunded
    ] = await Promise.all([
      this.orderModel.countDocuments({ userId: userObjectId, isDeleted: false }),
      this.orderModel.countDocuments({ userId: userObjectId, status: 'completed', isDeleted: false }),
      this.orderModel.aggregate([
        { $match: { userId: userObjectId, status: 'completed', isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]),
      this.orderModel.aggregate([
        { $match: { userId: userObjectId, isDeleted: false } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
      ]),
      this.orderModel.aggregate([
        { $match: { userId: userObjectId, isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      this.orderModel.aggregate([
        { $match: { userId: userObjectId, status: 'refunded', isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$payment.refundAmount' } } }
      ])
    ]);

    return {
      success: true,
      data: {
        totalOrders,
        completedOrders,
        totalSpent: totalSpent[0]?.total || 0,
        totalRefunded: totalRefunded[0]?.total || 0,
        ordersByType: ordersByType.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        ordersByStatus: ordersByStatus.reduce((acc, item) => {
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
    
    return this.orderModel.findOne({ ...query, isDeleted: false });
  }
}

