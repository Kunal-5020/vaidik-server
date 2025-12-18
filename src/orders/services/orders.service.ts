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
import { UserBlockingService } from 'src/users/services/user-blocking.service';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    // OrderPaymentService is now only for legacy/other order types, not chat/call conversation threads
    private orderPaymentService: OrderPaymentService,
    private walletService: WalletService,
    private notificationService: NotificationService,
    private earningsService: EarningsService,
    private userBlockingService: UserBlockingService,
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
  const conversationThreadId = this.generateConversationThreadId(userId, astrologerId);

  // ✅ Use findOneAndUpdate with upsert (atomic operation)
  const order = await this.orderModel.findOneAndUpdate(
    { conversationThreadId, isDeleted: false },
    {
      $setOnInsert: {
        orderId: this.generateOrderId(),
        conversationThreadId,
        userId: this.toObjectId(userId),
        astrologerId: this.toObjectId(astrologerId),
        astrologerName,
        type: 'conversation',
        ratePerMinute,
        status: 'active',
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
        payment: {
          status: 'none',
          heldAmount: 0,
          chargedAmount: 0,
          refundedAmount: 0
        }
      }
    },
    { 
      upsert: true, // Create if not exists
      new: true,    // Return the document
      runValidators: true
    }
  );

  this.logger.log(`Conversation thread: ${order.orderId} (new: ${order.isNew})`);
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

    const isBlocked = await this.userBlockingService.isAstrologerBlocked(
      new Types.ObjectId(orderData.userId),
      orderData.astrologerId,
    );

    if (isBlocked) {
      throw new BadRequestException(
        'You have blocked this astrologer. Please unblock them to proceed.'
      );
    }

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

    // ❌ STEP 3 REMOVED: No payment hold for chat/call sessions (post-paid model)

    // ❌ STEP 4 REMOVED: No maxDurationMinutes calculated from holds here
    // Max duration is computed on the session side using wallet balance at start.

    await conversationThread.save();
    this.logger.log(`Conversation thread updated for session ${orderData.sessionId}`);

    // ✅ RETURN THE CONVERSATION THREAD (not a new physical order per session)
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

  // ===== ACCEPT ORDER ===== (legacy, not used for conversation threads)
  async acceptOrder(
    orderId: string,
    astrologerId: string
  ): Promise<any> {
    const order = await this.orderModel.findOne({ orderId, isDeleted: false });
    if (!order || order.status !== 'pending') {
      throw new BadRequestException('Order not found or already processed');
    }

    order.status = 'waiting';
    order.acceptedAt = new Date();

    await order.save();

    this.logger.log(`Order accepted: ${orderId}`);

    return {
      success: true,
      message: 'Order accepted',
      status: 'waiting'
    };
  }

  // ===== REJECT ORDER ===== (no wallet refund for chat/call threads)
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

    // ❌ Removed: refundHold – chat/call threads do not use pre-hold any more

    // Update order
    order.status = 'cancelled';
    order.cancellationReason = reason;
    order.cancelledBy = 'astrologer';
    order.cancelledAt = new Date();

    await order.save();

    this.logger.log(`Order rejected: ${orderId}`);

    return {
      success: true,
      message: 'Order cancelled'
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

    // ❌ Removed: refundHold – chat/call threads now have no hold to refund

    // Update order
    order.status = 'cancelled';
    order.cancellationReason = 'astrologer_no_response';
    order.cancelledBy = 'system';
    order.cancelledAt = new Date();

    await order.save();

    this.logger.log(`Order timeout: ${orderId}`);

    // 🔔 Notify user about timeout (no charge made)
    this.notificationService.sendNotification({
      recipientId: order.userId.toString(),
      recipientModel: 'User',
      type: order.type === 'call' ? 'call_ended' : 'chat_message',
      title: order.type === 'call'
        ? 'Call request timed out'
        : 'Chat request timed out',
      message: 'Astrologer did not respond in time. No amount has been charged to your wallet.',
      data: {
        mode: order.type, // 'call' | 'chat' (legacy; for conversation threads treat accordingly)
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

  // ===== START SESSION (legacy; not used by new chat/call flow) =====
  async startSession(
    orderId: string,
    sessionId: string
  ): Promise<any> {
    const order = await this.orderModel.findOne({ orderId, isDeleted: false });
    if (!order || (order.status !== 'waiting' && order.status !== 'waiting_in_queue')) {
      throw new BadRequestException('Order not in valid state to start session');
    }

    // ❌ Removed: check for payment.status === 'hold'
    // In the new model, chat/call sessions manage timers and wallet themselves.

    order.status = 'active';
    order.startedAt = new Date();

    await order.save();

    this.logger.log(`Session started for order: ${orderId}`);

    return {
      success: true,
      message: 'Session started',
      maxDurationMinutes: order.maxDurationMinutes || 0
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
          type: 'conversation', // Ensures we get threads, not individual session records
          isDeleted: false
        })
        .populate('astrologerId', 'name profilePicture isOnline specializations') // Fetch specific fields
        .sort({ lastInteractionAt: -1 }) // Most recent first
        .skip(skip)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments({
        userId: this.toObjectId(userId),
        type: 'conversation',
        isDeleted: false
      })
    ]);

    // ✅ MAP Data to required format
    const formattedConversations = conversations.map(conv => {
      const astrologer = conv.astrologerId as any; // Cast for TS
      
      // Determine Category
      let category = 'none';
      if (conv.totalChatSessions > 0 && conv.totalCallSessions > 0) {
        category = 'both';
      } else if (conv.totalChatSessions > 0) {
        category = 'chat';
      } else if (conv.totalCallSessions > 0) {
        category = 'call';
      }

      return {
        orderId: conv.orderId,
        conversationThreadId: conv.conversationThreadId,
        astrologer: {
          _id: astrologer?._id,
          name: astrologer?.name || 'Unknown',
          profilePicture: astrologer?.profilePicture,
          isOnline: astrologer?.isOnline
        },
        lastMessage: conv.lastMessage ? {
          content: conv.lastMessage.content,
          type: conv.lastMessage.type,
          sentAt: conv.lastMessage.sentAt,
          isRead: conv.lastMessage.isRead
        } : null,
        category, // 'chat', 'call', 'both', or 'none'
        unreadCount: 0, // You can fetch real unread count from ChatMessageService if needed
        updatedAt: conv.lastInteractionAt || conv.createdAt
      };
    });

    return {
      success: true,
      data: {
        conversations: formattedConversations,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  // ===== COMPLETE SESSION & AGGREGATE (NO CHARGE HERE) =====
  async completeSession(
    orderId: string,
    sessionData: {
      sessionId: string;
      sessionType: 'chat' | 'audio_call' | 'video_call';
      actualDurationSeconds: number;
      billedMinutes: number;
      chargedAmount: number;
      recordingUrl?: string;
      recordingS3Key?: string;
      recordingDuration?: number;
    }
  ): Promise<any> {
    const order = await this.orderModel.findOne({ orderId, isDeleted: false });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // ✅ ONLY aggregate if there was actual duration (session was active)
    if (sessionData.actualDurationSeconds === 0) {
      this.logger.warn(`Session ${sessionData.sessionId} had 0 duration, skipping aggregation`);
      return {
        success: true,
        message: 'Session ended without activity',
        chargeResult: { billedMinutes: 0, chargedAmount: 0, refundedAmount: 0 }
      };
    }

    const billedMinutes = sessionData.billedMinutes;
    const chargedAmount = sessionData.chargedAmount;

    // ✅ Create session record (using already charged amounts from session)
    const sessionRecord = {
      sessionId: sessionData.sessionId,
      sessionType: sessionData.sessionType,
      startedAt: order.startedAt || new Date(),
      endedAt: new Date(),
      durationSeconds: sessionData.actualDurationSeconds,
      billedMinutes,
      chargedAmount,
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
    order.totalBilledMinutes += billedMinutes;
    order.totalAmount += chargedAmount;

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
    order.status = 'active';

    // ===== UPDATE ASTROLOGER EARNINGS =====
    try {
      const astrologer = await this.astrologerModel
        .findById(order.astrologerId)
        .select('earnings.platformCommission')
        .lean();

      if (astrologer) {
        const commissionRate = astrologer.earnings?.platformCommission ?? 40; // default 40% platform
        const userSpend = chargedAmount || 0;
        const platformCommission = (userSpend * commissionRate) / 100;
        const astrologerEarning = userSpend - platformCommission;

        if (astrologerEarning > 0) {
          const logicalSessionType =
            sessionData.sessionType === 'chat' ? 'chat' : 'call';

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
      `Billed: ${billedMinutes}m | Charged: ₹${chargedAmount} | ` +
      `Total sessions: ${order.totalSessions} | Total spent: ₹${order.totalAmount}`
    );

    return {
      success: true,
      message: 'Session completed and aggregated',
      chargeResult: {
        billedMinutes,
        chargedAmount,
        refundedAmount: 0
      },
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

  // ✅ NEW METHOD: UPDATE SESSION RECORDING (SYNC FOR PARALLEL PROCESSING)
  async updateSessionRecording(
    orderId: string,
    sessionId: string,
    recordingData: {
      recordingUrl: string;
      recordingS3Key: string;
      recordingDuration: number;
      recordingType: string;
    }
  ): Promise<void> {
    const updateResult = await this.orderModel.updateOne(
      { 
        orderId, 
        'sessionHistory.sessionId': sessionId 
      },
      {
        $set: {
          'sessionHistory.$.recordingUrl': recordingData.recordingUrl,
          'sessionHistory.$.recordingType': recordingData.recordingType
        }
      }
    );

    if (updateResult.modifiedCount > 0) {
      this.logger.log(`✅ Session recording synced to Order ${orderId} for session ${sessionId}`);
    } else {
      this.logger.warn(`⚠️ Failed to sync recording to Order ${orderId}. Session ${sessionId} not found in history.`);
    }
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

  // ===== CONTINUE CONSULTATION (no holds, just wallet-based limit) =====
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

    // ✅ Recalculate max duration based on current wallet (post-paid model)
    const walletBalance = await this.walletService.getBalance(userId);
    const maxDurationMinutes = Math.floor(walletBalance / order.ratePerMinute);

    if (maxDurationMinutes < 5) {
      throw new BadRequestException(
        `Insufficient balance. Need at least ₹${order.ratePerMinute * 5} to continue.`
      );
    }

    // Update order for continuation (no hold, just metadata)
    order.maxDurationMinutes = maxDurationMinutes;
    order.status = 'waiting'; // Back to waiting for acceptance

    await order.save();

    this.logger.log(`Order continued: ${orderId} | New max duration: ${maxDurationMinutes} mins`);

    return {
      success: true,
      message: 'Consultation ready to continue',
      orderId,
      maxDurationMinutes,
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

    // ❌ Removed: refundHold – no more holds for chat/call conversation threads

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
        review: order.reviewGiven
      }
    };
  }

  /**
 * Get astrologer's orders
 */
async getAstrologerOrders(
  astrologerId: string,
  filters: {
    page: number;
    limit: number;
    status?: string;
    type?: string;
  }
): Promise<any> {

  let astrologerObjectId: Types.ObjectId;
  
    astrologerObjectId = this.toObjectId(astrologerId);

  const query: any = {
    astrologerId: astrologerObjectId,
    isDeleted: false,
  };

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.type) {
    query.type = filters.type;
  }

  const skip = (filters.page - 1) * filters.limit;

  try {
    const [orders, total] = await Promise.all([
      this.orderModel
        .find(query)
        .populate('userId', 'name profileImage phoneNumber')
        .select('-isDeleted')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .lean(),
      this.orderModel.countDocuments(query),
    ]);

    // ✅ Log 7: Sample order data (first order only, for inspection)
    if (orders.length > 0) {
      this.logger.log('📝 [getAstrologerOrders] Sample order (first)');
    } else {
      // ✅ Log 8: Empty result investigation
      this.logger.warn('⚠️  [getAstrologerOrders] No orders found - Running diagnostics...');
      
      // Check if astrologer has ANY orders (ignoring filters)
      const anyOrders = await this.orderModel.countDocuments({
        astrologerId: astrologerObjectId,
      });
      
      // Check orders with this astrologer regardless of isDeleted
      const anyOrdersIncludingDeleted = await this.orderModel.countDocuments({
        astrologerId: astrologerObjectId,
        isDeleted: false,
      });

      // Check all conversation-type orders for this astrologer
      const conversationOrders = await this.orderModel.countDocuments({
        astrologerId: astrologerObjectId,
        type: 'conversation',
        isDeleted: false,
      });

      this.logger.warn('🔬 [getAstrologerOrders] Diagnostic results', {
        totalOrdersForAstrologer: anyOrders,
        nonDeletedOrders: anyOrdersIncludingDeleted,
        conversationTypeOrders: conversationOrders,
        appliedFilters: {
          status: filters.status || 'none',
          type: filters.type || 'none',
        },
        possibleIssues: [
          anyOrders === 0 ? '❌ No orders exist for this astrologer' : null,
          anyOrders > 0 && anyOrdersIncludingDeleted === 0 ? '❌ All orders are marked as deleted' : null,
          anyOrdersIncludingDeleted > 0 && conversationOrders === 0 ? '❌ Orders exist but none are type "conversation"' : null,
          filters.status && anyOrdersIncludingDeleted > 0 ? `⚠️ Status filter "${filters.status}" might be too restrictive` : null,
          filters.type && anyOrdersIncludingDeleted > 0 ? `⚠️ Type filter "${filters.type}" might be too restrictive` : null,
        ].filter(Boolean),
      });
    }

    // ✅ Log 9: Return data structure
    this.logger.log('✅ [getAstrologerOrders] Returning response');

    return {
      success: true,
      data: {
        orders,
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total,
          pages: Math.ceil(total / filters.limit),
        },
      },
    };
  } catch (queryError) {
    // ✅ Log 10: Query execution error
    this.logger.error('❌ [getAstrologerOrders] Query execution failed', {
      error: queryError.message,
      stack: queryError.stack,
      query: JSON.stringify(query, (key, value) => 
        value instanceof Types.ObjectId ? value.toString() : value
      ),
    });
    throw queryError;
  }
}


/**
 * Get astrologer order details
 */
async getAstrologerOrderDetails(
  orderId: string,
  astrologerId: string
): Promise<any> {
  const order = await this.orderModel
    .findOne({
      orderId,
      astrologerId: this.toObjectId(astrologerId),
      isDeleted: false
    })
    .populate('userId', 'name profileImage profilePicture phoneNumber email privacy gender dateOfBirth timeOfBirth placeOfBirth')
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
  // ✅ REPLACE with simple tracking:
async markReviewGiven(
  orderId: string,
  userId: string,
  reviewId: string
): Promise<any> {
  const order = await this.orderModel.findOne({
    orderId,
    userId: this.toObjectId(userId),
    isDeleted: false
  });

  if (!order) {
    throw new NotFoundException('Order not found');
  }

  if (order.reviewGiven) {
    throw new BadRequestException('Review already submitted for this order');
  }

  order.reviewGiven = true;
  order.reviewGivenAt = new Date();
  order.reviewId = this.toObjectId(reviewId);

  await order.save();

  this.logger.log(`Review tracked for order: ${orderId}`);

  return {
    success: true,
    message: 'Review recorded successfully'
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
