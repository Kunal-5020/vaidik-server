// src/orders/services/orders.service.ts

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../schemas/orders.schema';
import { OrderPaymentService } from './order-payment.service';
import { WalletService } from '../../payments/services/wallet.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    private orderPaymentService: OrderPaymentService,
    private walletService: WalletService
  ) {}

  // ===== HELPERS =====
  private generateOrderId(): string {
    return `ORD_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
  }

  private toObjectId(id: string): Types.ObjectId {
    try {
      return new Types.ObjectId(id);
    } catch {
      throw new BadRequestException('Invalid ID format');
    }
  }

  // ===== CREATE ORDER =====
  async createOrder(orderData: {
    userId: string;
    astrologerId: string;
    astrologerName: string;
    type: 'call' | 'chat';
    callType?: 'audio' | 'video';
    ratePerMinute: number;
    sessionId: string;
  }): Promise<OrderDocument> {
    const orderId = this.generateOrderId();

    // ✅ HOLD payment (minimum 5 mins)
    await this.orderPaymentService.holdPayment(
      orderId,
      orderData.userId,
      orderData.ratePerMinute,
      5
    );

    // ✅ Calculate max duration based on wallet
    const maxDurationInfo = await this.orderPaymentService.calculateMaxDuration(
      orderData.userId,
      orderData.ratePerMinute
    );

    const orderPayload: any = {
      orderId,
      userId: this.toObjectId(orderData.userId),
      astrologerId: this.toObjectId(orderData.astrologerId),
      astrologerName: orderData.astrologerName,
      type: orderData.type,
      ratePerMinute: orderData.ratePerMinute,
      maxDurationMinutes: maxDurationInfo.maxDurationMinutes,
      status: 'pending', // ✅ Initial state
      requestCreatedAt: new Date(),
      isActive: true,
      sessionHistory: [],
      totalUsedDurationSeconds: 0,
      totalBilledMinutes: 0,
      totalAmount: 0,
      reviewSubmitted: false,
      isDeleted: false,
      payment: {
        status: 'hold',
        heldAmount: orderData.ratePerMinute * 5,
        chargedAmount: 0,
        refundedAmount: 0
      }
    };

    if (orderData.type === 'call') {
      orderPayload.callSessionId = orderData.sessionId;
      orderPayload.callType = orderData.callType || 'audio';
      orderPayload.hasRecording = false;
    } else {
      orderPayload.chatSessionId = orderData.sessionId;
    }

    const order = new this.orderModel(orderPayload);
    await order.save();

    this.logger.log(`Order created: ${orderId} | Type: ${orderData.type} | Max Duration: ${maxDurationInfo.maxDurationMinutes} mins`);

    return order;
  }

  // ===== UPDATE ORDER STATUS =====
  async updateOrderStatus(
    orderId: string,
    status: string
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findOneAndUpdate(
      { orderId, isDeleted: false },
      { $set: { status } },
      { new: true }
    );

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    this.logger.log(`Order status updated: ${orderId} → ${status}`);
    return order;
  }

  // ===== ACCEPT ORDER =====
  async acceptOrder(
    orderId: string,
    astrologerId: string
  ): Promise<any> {
    const order = await this.orderModel.findOne({ orderId, isDeleted: false });
    if (!order || order.status !== 'pending') {
      throw new BadRequestException('Order not found or already processed');
    }

    // ✅ For now, mark as waiting (in real system, check if astrologer is free)
    order.status = 'waiting'; // Will transition to ACTIVE when session starts
    order.acceptedAt = new Date();

    await order.save();

    this.logger.log(`Order accepted: ${orderId}`);

    return {
      success: true,
      message: 'Order accepted',
      status: 'waiting'
    };
  }

  // ===== REJECT ORDER =====
  async rejectOrder(
    orderId: string,
    astrologerId: string,
    reason: string = 'rejected_by_astrologer'
  ): Promise<any> {
    const order = await this.orderModel.findOne({ orderId, isDeleted: false });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== 'pending') {
      throw new BadRequestException('Order cannot be rejected at this stage');
    }

    // ✅ Refund hold amount
    await this.orderPaymentService.refundHold(
      orderId,
      order.userId.toString(),
      reason
    );

    // Update order
    order.status = 'cancelled';
    order.cancellationReason = reason;
    order.cancelledBy = 'astrologer';
    order.cancelledAt = new Date();

    await order.save();

    this.logger.log(`Order rejected: ${orderId}`);

    return {
      success: true,
      message: 'Order cancelled and refunded'
    };
  }

  // ===== HANDLE TIMEOUT (3 mins) =====
  async handleOrderTimeout(orderId: string): Promise<any> {
    const order = await this.orderModel.findOne({ orderId, isDeleted: false });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== 'pending' && order.status !== 'waiting') {
      return; // Already processed
    }

    // ✅ Refund hold amount
    await this.orderPaymentService.refundHold(
      orderId,
      order.userId.toString(),
      'timeout - astrologer no response'
    );

    // Update order
    order.status = 'cancelled';
    order.cancellationReason = 'astrologer_no_response';
    order.cancelledBy = 'system';
    order.cancelledAt = new Date();

    await order.save();

    this.logger.log(`Order timeout: ${orderId}`);

    return {
      success: true,
      message: 'Order cancelled due to timeout'
    };
  }

  // ===== START SESSION (Transition to ACTIVE) =====
  async startSession(
    orderId: string,
    sessionId: string
  ): Promise<any> {
    const order = await this.orderModel.findOne({ orderId, isDeleted: false });
    if (!order || (order.status !== 'waiting' && order.status !== 'waiting_in_queue')) {
      throw new BadRequestException('Order not in valid state to start session');
    }

    // ✅ Verify payment is still on hold
    if (order.payment.status !== 'hold') {
      throw new BadRequestException('Payment not in hold status');
    }

    order.status = 'active'; // ✅ NOW charging window is open
    order.startedAt = new Date();

    await order.save();

    this.logger.log(`Session started for order: ${orderId}`);

    return {
      success: true,
      message: 'Session started - charging active',
      maxDurationMinutes: order.maxDurationMinutes
    };
  }

  // ===== COMPLETE SESSION & CHARGE =====
  async completeSession(
  orderId: string,
  sessionData: {
    sessionId: string;
    sessionType: 'chat' | 'audio_call' | 'video_call';
    actualDurationSeconds: number;
    recordingUrl?: string;
    recordingS3Key?: string;
    recordingDuration?: number;
  }
): Promise<any> {
  const order = await this.orderModel.findOne({ orderId, isDeleted: false });
  if (!order) {
    throw new NotFoundException('Order not found');
  }

  if (order.status !== 'active') {
    throw new BadRequestException('Order is not active');
  }

  // Charge from hold
  const chargeResult = await this.orderPaymentService.chargeFromHold(
    orderId,
    order.userId.toString(),
    sessionData.actualDurationSeconds,
    order.ratePerMinute
  );

  // ✅ FIXED: Ensure startedAt is always a Date (not undefined)
  const sessionRecord = {
    sessionId: sessionData.sessionId,
    sessionType: sessionData.sessionType,
    startedAt: order.startedAt || new Date(), // ✅ Fallback to now if undefined
    endedAt: new Date(),
    durationSeconds: sessionData.actualDurationSeconds,
    billedMinutes: chargeResult.billedMinutes,
    chargedAmount: chargeResult.chargedAmount,
    recordingUrl: sessionData.recordingUrl
  };

  order.sessionHistory.push(sessionRecord);
  order.totalUsedDurationSeconds += sessionData.actualDurationSeconds;
  order.totalBilledMinutes += chargeResult.billedMinutes;

  // Add recording details if available
  if (sessionData.recordingUrl) {
    order.hasRecording = true;
    order.recordingUrl = sessionData.recordingUrl;
    order.recordingS3Key = sessionData.recordingS3Key;
    order.recordingDuration = sessionData.recordingDuration;
    order.recordingType = sessionData.sessionType === 'audio_call' ? 'voice_note' : 'video';
    order.recordingStartedAt = order.startedAt || new Date(); // ✅ Same fix
    order.recordingEndedAt = new Date();
  }

  order.lastSessionEndTime = new Date();
  order.endedAt = new Date();

  // Keep isActive = true (user can continue)
  order.isActive = true;

  await order.save();

  this.logger.log(
    `Session completed: ${orderId} | Billed: ${chargeResult.billedMinutes} mins | Charged: ₹${chargeResult.chargedAmount}`
  );

  return {
    success: true,
    message: 'Session completed and charged',
    chargeResult,
    sessionHistory: order.sessionHistory,
    totalSpent: order.totalAmount
  };
}

  // ===== FIND ACTIVE ORDER WITH ASTROLOGER =====
  async findActiveOrderWithAstrologer(
    userId: string,
    astrologerId: string
  ): Promise<OrderDocument | null> {
    return this.orderModel.findOne({
      userId: this.toObjectId(userId),
      astrologerId: this.toObjectId(astrologerId),
      status: { $in: ['pending', 'waiting', 'waiting_in_queue', 'active'] },
      isDeleted: false
    });
  }

  // ===== CONTINUE CONSULTATION =====
  async continueConsultation(
    orderId: string,
    userId: string
  ): Promise<any> {
    const order = await this.orderModel.findOne({
      orderId,
      userId: this.toObjectId(userId),
      isActive: true,
      isDeleted: false
    });

    if (!order) {
      throw new NotFoundException('Order not found or not available for continuation');
    }

    // ✅ Recalculate max duration based on current wallet
    const maxDurationInfo = await this.orderPaymentService.calculateMaxDuration(
      userId,
      order.ratePerMinute
    );

    if (maxDurationInfo.maxDurationMinutes < 5) {
      throw new BadRequestException(
        `Insufficient balance. Need at least ₹${order.ratePerMinute * 5} to continue.`
      );
    }

    // ✅ HOLD new payment for continuation
    await this.orderPaymentService.holdPayment(
      orderId,
      userId,
      order.ratePerMinute,
      maxDurationInfo.maxDurationMinutes
    );

    // Update order for continuation
    order.maxDurationMinutes = maxDurationInfo.maxDurationMinutes;
    order.status = 'waiting'; // Back to waiting for acceptance

    await order.save();

    this.logger.log(`Order continued: ${orderId} | New max duration: ${maxDurationInfo.maxDurationMinutes} mins`);

    return {
      success: true,
      message: 'Consultation ready to continue',
      orderId,
      maxDurationMinutes: maxDurationInfo.maxDurationMinutes,
      previousSessions: order.sessionHistory.length,
      totalPreviouslySpent: order.totalAmount,
      type: order.type,
      callType: order.callType
    };
  }

  // ===== CANCEL ORDER =====
  async cancelOrder(
    orderId: string,
    userId: string,
    reason: string,
    cancelledBy: 'user' | 'astrologer' | 'system' | 'admin'
  ): Promise<any> {
    const order = await this.orderModel.findOne({
      orderId,
      userId: this.toObjectId(userId),
      status: { $in: ['pending', 'waiting', 'waiting_in_queue'] },
      isDeleted: false
    });

    if (!order) {
      throw new NotFoundException('Order not found or cannot be cancelled at this stage');
    }

    // ✅ Refund hold if payment is still on hold
    if (order.payment.status === 'hold') {
      await this.orderPaymentService.refundHold(
        orderId,
        userId,
        `Cancellation: ${reason}`
      );
    }

    order.status = 'cancelled';
    order.cancellationReason = reason;
    order.cancelledBy = cancelledBy;
    order.cancelledAt = new Date();

    await order.save();

    this.logger.log(`Order cancelled: ${orderId} | By: ${cancelledBy}`);

    return {
      success: true,
      message: 'Order cancelled successfully'
    };
  }

  // ===== GET ORDER DETAILS =====
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

  // ===== GET USER ORDERS =====
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
          hasPrev: page > 1
        }
      }
    };
  }

  // ===== GET CONSULTATION SPACE (All sessions in order) =====
  async getConsultationSpace(orderId: string, userId: string): Promise<any> {
    const order = await this.orderModel
      .findOne({
        orderId,
        userId: this.toObjectId(userId),
        isDeleted: false
      })
      .populate('astrologerId', 'name profilePicture experienceYears specializations ratings');

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return {
      success: true,
      data: {
        orderId: order.orderId,
        astrologer: {
          id: order.astrologerId,
          name: order.astrologerName
        },
        type: order.type,
        status: order.status,
        isActive: order.isActive,
        createdAt: order.createdAt,
        sessionHistory: order.sessionHistory,
        totalUsedDuration: order.totalUsedDurationSeconds,
        totalBilled: order.totalBilledMinutes,
        totalSpent: order.totalAmount,
        lastSessionEnd: order.lastSessionEndTime,
        rating: order.rating,
        review: order.review
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
      isDeleted: false
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.reviewSubmitted) {
      throw new BadRequestException('Review already submitted');
    }

    order.rating = rating;
    order.review = review || '';
    order.reviewSubmitted = true;
    order.reviewSubmittedAt = new Date();

    await order.save();

    this.logger.log(`Review added: ${orderId} | Rating: ${rating}`);

    return {
      success: true,
      message: 'Review submitted successfully'
    };
  }

  // ===== REQUEST REFUND =====
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

    if (order.refundRequest && order.refundRequest.status === 'pending') {
      throw new BadRequestException('Refund request already submitted');
    }

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

    this.logger.log(`Refund requested: ${orderId}`);

    return {
      success: true,
      message: 'Refund request submitted',
      refundAmount: order.totalAmount
    };
  }

  // ===== GET REFUND STATUS =====
  async getRefundStatus(orderId: string, userId: string): Promise<any> {
    const order = await this.orderModel
      .findOne({
        orderId,
        userId: this.toObjectId(userId),
        isDeleted: false
      })
      .select('orderId status refundRequest');

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (!order.refundRequest) {
      return {
        success: true,
        data: {
          orderId,
          hasRefundRequest: false,
          status: order.status
        }
      };
    }

    return {
      success: true,
      data: {
        orderId,
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

  // ===== GET RECORDING =====
  async getOrderRecording(orderId: string, userId: string): Promise<any> {
    const order = await this.orderModel
      .findOne({
        orderId,
        userId: this.toObjectId(userId),
        isDeleted: false,
        hasRecording: true
      })
      .select('orderId recordingUrl recordingType recordingDuration callType');

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

  // ===== GET ORDER STATS =====
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
      this.orderModel.countDocuments({
        userId: userObjectId,
        status: 'completed',
        isDeleted: false
      }),
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
        { $group: { _id: null, total: { $sum: '$payment.refundedAmount' } } }
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

  // ===== FIND ORDER BY SESSION ID =====
  async findOrderBySessionId(sessionId: string, type: 'call' | 'chat'): Promise<OrderDocument | null> {
    const query = type === 'call'
      ? { callSessionId: sessionId }
      : { chatSessionId: sessionId };

    return this.orderModel.findOne({ ...query, isDeleted: false });
  }
}
