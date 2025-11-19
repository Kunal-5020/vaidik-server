// src/orders/services/orders.service.ts

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../schemas/orders.schema';
import { OrderPaymentService } from './order-payment.service';
import { WalletService } from '../../payments/services/wallet.service';
import { NotificationService } from '../../notifications/services/notification.service';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { EarningsService } from '../../astrologers/services/earnings.service';


@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private orderPaymentService: OrderPaymentService,
    private walletService: WalletService,
    private notificationService: NotificationService,
    private earningsService: EarningsService,
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

  // ===== FIND OR CREATE CONVERSATION THREAD =====
async findOrCreateConversationThread(
  userId: string,
  astrologerId: string,
  astrologerName: string,
  ratePerMinute: number
): Promise<OrderDocument> {
  // Generate conversation thread ID
  const conversationThreadId = this.generateConversationThreadId(userId, astrologerId);

  // Try to find existing conversation thread
  let order = await this.orderModel.findOne({
    conversationThreadId,
    isDeleted: false
  });

  if (order) {
    this.logger.log(`Found existing conversation thread: ${order.orderId}`);
    return order;
  }

  // Create new conversation thread
  const orderId = this.generateOrderId();

  order = new this.orderModel({
    orderId,
    conversationThreadId,
    userId: this.toObjectId(userId),
    astrologerId: this.toObjectId(astrologerId),
    astrologerName,
    type: 'conversation', // ✅ NEW TYPE
    ratePerMinute,
    status: 'active', // ✅ Conversation threads are always active
    requestCreatedAt: new Date(),
    isActive: true,
    sessionHistory: [],
    totalUsedDurationSeconds: 0,
    totalBilledMinutes: 0,
    totalAmount: 0,
    totalSessions: 0,
    totalChatSessions: 0,
    totalCallSessions: 0,
    messageCount: 0,
    reviewSubmitted: false,
    isDeleted: false,
    payment: {
      status: 'none', // ✅ No payment yet (per-session basis)
      heldAmount: 0,
      chargedAmount: 0,
      refundedAmount: 0
    }
  });

  await order.save();
  this.logger.log(`Created new conversation thread: ${orderId} | Thread ID: ${conversationThreadId}`);

  return order;
}

// ===== GENERATE CONVERSATION THREAD ID =====
private generateConversationThreadId(userId: string, astrologerId: string): string {
  // Sort IDs to ensure consistency (user_A + astro_B = same as astro_B + user_A)
  const ids = [userId, astrologerId].sort();
  return `THREAD_${ids[0]}_${ids[1]}`;
}


  // ===== CREATE ORDER (NEW SESSION WITHIN CONVERSATION THREAD) =====
async createOrder(orderData: {
  userId: string;
  astrologerId: string;
  astrologerName: string;
  type: 'call' | 'chat';
  callType?: 'audio' | 'video';
  ratePerMinute: number;
  sessionId: string;
}): Promise<OrderDocument> {
  
  // ✅ STEP 1: Find or create conversation thread
  const conversationThread = await this.findOrCreateConversationThread(
    orderData.userId,
    orderData.astrologerId,
    orderData.astrologerName,
    orderData.ratePerMinute
  );

  this.logger.log(`Using conversation thread: ${conversationThread.orderId} for new ${orderData.type} session`);

  // ✅ STEP 2: Update conversation thread with current session info
  conversationThread.currentSessionId = orderData.sessionId;
  conversationThread.currentSessionType = orderData.type === 'call' 
    ? (orderData.callType === 'video' ? 'video_call' : 'audio_call')
    : 'chat';

  if (orderData.type === 'call') {
    conversationThread.callSessionId = orderData.sessionId;
    conversationThread.callType = orderData.callType;
  } else {
    conversationThread.chatSessionId = orderData.sessionId;
  }

  // ✅ STEP 3: Hold payment for this session
  await this.orderPaymentService.holdPayment(
    conversationThread.orderId,
    orderData.userId,
    orderData.ratePerMinute,
    5
  );
  this.logger.log(`Payment hold successful for session ${orderData.sessionId}`);

  // ✅ STEP 4: Calculate max duration
  const maxDurationInfo = await this.orderPaymentService.calculateMaxDuration(
    orderData.userId,
    orderData.ratePerMinute
  );

  conversationThread.maxDurationMinutes = maxDurationInfo.maxDurationMinutes;
  conversationThread.payment = {
    status: 'hold',
    heldAmount: orderData.ratePerMinute * 5,
    chargedAmount: 0,
    refundedAmount: 0,
    heldAt: new Date(),
  };

  await conversationThread.save();
  this.logger.log(`Conversation thread updated for session ${orderData.sessionId}`);

  // ✅ RETURN THE CONVERSATION THREAD (not a new order!)
  return conversationThread;
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
    'astrologer_no_response'
  );

  // Update order
  order.status = 'cancelled';
  order.cancellationReason = 'astrologer_no_response';
  order.cancelledBy = 'system';
  order.cancelledAt = new Date();

  await order.save();

  this.logger.log(`Order timeout: ${orderId}`);

  // 🔔 Notify user about timeout and refund (fire-and-forget)
  this.notificationService.sendNotification({
    recipientId: order.userId.toString(),
    recipientModel: 'User',
    type: order.type === 'call' ? 'call_ended' : 'chat_message',
    title: order.type === 'call'
      ? 'Call request timed out'
      : 'Chat request timed out',
    message: 'Astrologer did not respond in time. The held amount has been refunded to your wallet.',
    data: {
      mode: order.type,                // 'call' | 'chat'
      orderId: order.orderId,
      sessionId: order.type === 'call' ? order.callSessionId : order.chatSessionId,
      astrologerId: order.astrologerId.toString(),
      step: 'astrologer_no_response',
    },
    priority: 'medium',
  }).catch(err => this.logger.error(`Timeout notification error: ${err.message}`));

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

  // ===== GET CONVERSATION STATISTICS =====
async getConversationStats(orderId: string, userId: string): Promise<any> {
  const order = await this.orderModel.findOne({
    orderId,
    userId: this.toObjectId(userId),
    isDeleted: false
  });

  if (!order) {
    throw new NotFoundException('Conversation not found');
  }

  return {
    success: true,
    data: {
      orderId: order.orderId,
      conversationThreadId: order.conversationThreadId,
      totalSessions: order.totalSessions,
      totalChatSessions: order.totalChatSessions,
      totalCallSessions: order.totalCallSessions,
      totalMessages: order.messageCount,
      totalSpent: order.totalAmount,
      totalDuration: order.totalUsedDurationSeconds,
      totalBilledMinutes: order.totalBilledMinutes,
      lastInteractionAt: order.lastInteractionAt,
      createdAt: order.createdAt,
      sessionHistory: order.sessionHistory.map(session => ({
        sessionId: session.sessionId,
        type: session.sessionType,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        duration: session.durationSeconds,
        billedMinutes: session.billedMinutes,
        amount: session.chargedAmount,
        hasRecording: !!session.recordingUrl,
        recordingUrl: session.recordingUrl,
        recordingType: session.recordingType
      }))
    }
  };
}

// ===== GET ALL USER CONVERSATIONS =====
async getUserConversations(
  userId: string,
  page: number = 1,
  limit: number = 20
): Promise<any> {
  const skip = (page - 1) * limit;

  const [conversations, total] = await Promise.all([
    this.orderModel
      .find({
        userId: this.toObjectId(userId),
        type: 'conversation',
        isDeleted: false
      })
      .populate('astrologerId', 'name profilePicture isOnline experienceYears ratings')
      .sort({ lastInteractionAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.orderModel.countDocuments({
      userId: this.toObjectId(userId),
      type: 'conversation',
      isDeleted: false
    })
  ]);

  return {
    success: true,
    data: {
      conversations: conversations.map(conv => ({
        orderId: conv.orderId,
        conversationThreadId: conv.conversationThreadId,
        astrologer: conv.astrologerId,
        totalSessions: conv.totalSessions,
        totalMessages: conv.messageCount,
        totalSpent: conv.totalAmount,
        lastInteractionAt: conv.lastInteractionAt,
        createdAt: conv.createdAt
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
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

  // ✅ ONLY process if there was actual duration (session was active)
  if (sessionData.actualDurationSeconds === 0) {
    this.logger.warn(`Session ${sessionData.sessionId} had 0 duration, skipping billing`);
    return {
      success: true,
      message: 'Session ended without activity',
      chargeResult: { billedMinutes: 0, chargedAmount: 0, refundedAmount: 0 }
    };
  }

  // ✅ Charge from hold
  const chargeResult = await this.orderPaymentService.chargeFromHold(
    orderId,
    order.userId.toString(),
    sessionData.actualDurationSeconds,
    order.ratePerMinute
  );

  // ✅ Create session record
  const sessionRecord = {
    sessionId: sessionData.sessionId,
    sessionType: sessionData.sessionType,
    startedAt: order.startedAt || new Date(),
    endedAt: new Date(),
    durationSeconds: sessionData.actualDurationSeconds,
    billedMinutes: chargeResult.billedMinutes,
    chargedAmount: chargeResult.chargedAmount,
    recordingUrl: sessionData.recordingUrl,
    recordingType: sessionData.recordingUrl 
      ? (sessionData.sessionType === 'audio_call' ? 'voice_note' : 'video')
      : undefined,
    status: 'completed'
  };

  // ✅ Add to session history
  order.sessionHistory.push(sessionRecord);

  // ✅ Update cumulative stats
  order.totalUsedDurationSeconds += sessionData.actualDurationSeconds;
  order.totalBilledMinutes += chargeResult.billedMinutes;
  order.totalAmount += chargeResult.chargedAmount;

  // ✅ Update conversation statistics
  order.totalSessions = order.sessionHistory.length;
  order.totalChatSessions = order.sessionHistory.filter(s => s.sessionType === 'chat').length;
  order.totalCallSessions = order.sessionHistory.filter(s => 
    s.sessionType === 'audio_call' || s.sessionType === 'video_call'
  ).length;

  // ✅ Update last interaction timestamp
  order.lastInteractionAt = new Date();
  order.lastSessionEndTime = new Date();
  order.endedAt = new Date();

  // ✅ Clear current session reference (session completed)
  order.currentSessionId = undefined;
  order.currentSessionType = 'none';

  // ✅ Keep conversation thread active for future sessions
  order.isActive = true;
  order.status = 'active'; // Conversation thread stays active

  // ===== UPDATE ASTROLOGER EARNINGS =====
  try {
    // Load astrologer commission rate
    const astrologer = await this.astrologerModel
      .findById(order.astrologerId)
      .select('earnings.platformCommission')
      .lean();

    if (astrologer) {
      const commissionRate = astrologer.earnings?.platformCommission ?? 40; // default 40% platform
      const userSpend = chargeResult.chargedAmount || 0;
      const platformCommission = (userSpend * commissionRate) / 100;
      const astrologerEarning = userSpend - platformCommission;

      if (astrologerEarning > 0) {
        const logicalSessionType =
          sessionData.sessionType === 'chat' ? 'chat' : 'call';

        // This will increment earnings.totalEarned & withdrawableAmount
        await this.earningsService.updateEarnings(
          order.astrologerId.toString(),
          userSpend,
          logicalSessionType,
        );

        this.logger.log(
          `Earnings updated for astrologer ${order.astrologerId}: userSpend=₹${userSpend}, ` +
          `commissionRate=${commissionRate}%, earning≈₹${astrologerEarning.toFixed(2)}`,
        );
      }
    } else {
      this.logger.warn(
        `Astrologer not found for earnings update: ${order.astrologerId.toString()}`,
      );
    }
  } catch (err: any) {
    this.logger.error(
      `Failed to update astrologer earnings for session ${sessionData.sessionId}: ${err.message}`,
    );
  }

  await order.save();

  this.logger.log(
    `✅ Session completed: ${sessionData.sessionId} | Type: ${sessionData.sessionType} | ` +
    `Billed: ${chargeResult.billedMinutes}m | Charged: ₹${chargeResult.chargedAmount} | ` +
    `Total sessions: ${order.totalSessions} | Total spent: ₹${order.totalAmount}`
  );

  return {
    success: true,
    message: 'Session completed and charged',
    chargeResult,
    sessionHistory: order.sessionHistory,
    conversationStats: {
      totalSessions: order.totalSessions,
      totalChatSessions: order.totalChatSessions,
      totalCallSessions: order.totalCallSessions,
      totalSpent: order.totalAmount,
      totalDuration: order.totalUsedDurationSeconds
    }
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
