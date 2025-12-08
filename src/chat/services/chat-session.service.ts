// src/chat/services/chat-session.service.ts

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatSession, ChatSessionDocument } from '../schemas/chat-session.schema';
import { OrdersService } from '../../orders/services/orders.service';
import { OrderPaymentService } from '../../orders/services/order-payment.service';
import { WalletService } from '../../payments/services/wallet.service';
import { NotificationService } from '../../notifications/services/notification.service';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { EarningsService } from '../../astrologers/services/earnings.service';
import { PenaltyService } from '../../astrologers/services/penalty.service';

@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);
  private sessionTimers = new Map<string, NodeJS.Timeout>();
  private joinTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(ChatSession.name) private sessionModel: Model<ChatSessionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private ordersService: OrdersService,
    private orderPaymentService: OrderPaymentService,
    private walletService: WalletService,
    private notificationService: NotificationService,
    private earningsService: EarningsService,
    private penaltyService: PenaltyService,
  ) {}

  private generateSessionId(): string {
    return `CHAT_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
  }

  private toObjectId(id: string): Types.ObjectId {
    try {
      return new Types.ObjectId(id);
    } catch {
      throw new BadRequestException('Invalid ID format');
    }
  }

  // ===== INITIATE CHAT =====
  async initiateChat(sessionData: {
    userId: string;
    astrologerId: string;
    astrologerName: string;
    ratePerMinute: number;
  }): Promise<any> {
    const estimatedCost = sessionData.ratePerMinute * 5;
    const hasBalance = await this.walletService.checkBalance(
      sessionData.userId,
      estimatedCost
    );

    if (!hasBalance) {
      throw new BadRequestException(
        `Insufficient balance. Minimum ₹${estimatedCost} required to start chat.`
      );
    }

    const sessionId = this.generateSessionId();
    console.log(sessionId, 'generated session id');

    // ✅ STEP 1: Find or create conversation thread (returns existing order!)
    const conversationThread = await this.ordersService.findOrCreateConversationThread(
      sessionData.userId,
      sessionData.astrologerId,
      sessionData.astrologerName,
      sessionData.ratePerMinute
    );

    this.logger.log(`Using conversation thread: ${conversationThread.orderId}`);

    // ✅ STEP 2: Create order for this session (updates conversation thread)
    const order = await this.ordersService.createOrder({
      userId: sessionData.userId,
      astrologerId: sessionData.astrologerId,
      astrologerName: sessionData.astrologerName,
      type: 'chat',
      ratePerMinute: sessionData.ratePerMinute,
      sessionId: sessionId
    });

    if (!order || !order.orderId) {
      this.logger.error('Order creation failed');
      throw new Error('Order creation failed');
    }

    this.logger.log(`Order reference: ${order.orderId}`);

    // ✅ STEP 3: Calculate session number (how many chats in this thread?)
    const sessionNumber = order.sessionHistory.filter(s => s.sessionType === 'chat').length + 1;

    // ✅ STEP 4: Create chat session linked to conversation thread
    const session = new this.sessionModel({
      sessionId,
      userId: this.toObjectId(sessionData.userId),
      astrologerId: this.toObjectId(sessionData.astrologerId),
      orderId: order.orderId, // conversation thread orderId
      conversationThreadId: order.conversationThreadId,
      sessionNumber,
      ratePerMinute: sessionData.ratePerMinute,
      status: 'initiated',
      requestCreatedAt: new Date(),
      ringTime: new Date(),
      maxDurationMinutes: 0,
      maxDurationSeconds: 0,
      timerStatus: 'not_started',
      timerMetrics: {
        elapsedSeconds: 0,
        remainingSeconds: 0
      }
    });

    await session.save();

    // Set 3-min timeout
    this.setRequestTimeout(sessionId, order.orderId, sessionData.userId);

    // ✅ Fire-and-forget notification to astrologer
    // ✅ Notify astrologer (incoming chat request) – type MUST be "chat_request"
this.notificationService.sendNotification({
  recipientId: sessionData.astrologerId,
  recipientModel: 'Astrologer',
  type: 'chat_request', // matches astrologer app getNotificationConfig
  title: 'New chat request',
  message: 'You have a new chat request from a user.',
  data: {
    type: 'chat_request',            // so app sees data.type correctly
    mode: 'chat',
    sessionId,
    orderId: order.orderId,
    conversationThreadId: order.conversationThreadId,
    userId: sessionData.userId,
    astrologerId: sessionData.astrologerId,
    ratePerMinute: sessionData.ratePerMinute,
    step: 'user_initiated',
    fullScreen: 'true',
  },
  priority: 'high',
}).catch(err =>
  this.logger.error(`Chat incoming notification error: ${err.message}`),
);


    this.logger.log(
      `Chat initiated: ${sessionId} | Thread: ${order.conversationThreadId} | Session #${sessionNumber}`,
    );

    return {
      success: true,
      message: 'Chat initiated - waiting for astrologer',
      data: {
        sessionId: session.sessionId,
        orderId: order.orderId,
        conversationThreadId: order.conversationThreadId,
        sessionNumber,
        status: 'initiated',
        ratePerMinute: sessionData.ratePerMinute
      }
    };
  }

  // ===== ACCEPT CHAT =====
  async acceptChat(sessionId: string, astrologerId: string): Promise<any> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== 'initiated') {
      throw new BadRequestException('Session not in initiated state');
    }

    if (this.sessionTimers.has(sessionId)) {
      clearTimeout(this.sessionTimers.get(sessionId)!);
      this.sessionTimers.delete(sessionId);
    }

    session.status = 'waiting';
    session.acceptedAt = new Date();
    await session.save();

    // 🆕 Start 60s join timeout for user
    this.setUserJoinTimeout(sessionId);

    // Notify user that astrologer accepted
    // Notify user that astrologer accepted – use "request_accepted"
this.notificationService.sendNotification({
  recipientId: session.userId.toString(),
  recipientModel: 'User',
  type: 'request_accepted',
  title: 'Astrologer accepted your chat',
  message: 'Tap to start your chat session.',
  data: {
    type: 'request_accepted',
    mode: 'chat',
    sessionId: session.sessionId,
    orderId: session.orderId,
    astrologerId,
    ratePerMinute: session.ratePerMinute,
    step: 'astrologer_accepted',
    fullScreen: 'true',
  },
  priority: 'high',
}).catch(err =>
  this.logger.error(`Chat accepted notification error: ${err.message}`),
);


    this.logger.log(`Chat accepted: ${sessionId}`);

    return {
      success: true,
      message: 'Chat accepted',
      status: 'waiting'
    };
  }

  // ===== REJECT CHAT =====
  async rejectChat(
    sessionId: string,
    astrologerId: string,
    reason: string
  ): Promise<any> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== 'initiated' && session.status !== 'waiting') {
      throw new BadRequestException('Session cannot be rejected at this stage');
    }

    if (this.sessionTimers.has(sessionId)) {
      clearTimeout(this.sessionTimers.get(sessionId)!);
      this.sessionTimers.delete(sessionId);
    }

    session.status = 'rejected';
    session.endedBy = astrologerId;
    session.endReason = 'astrologer_rejected';
    session.endTime = new Date();
    await session.save();

    // ✅ NEW: Apply penalty for rejection
    try {
      await this.penaltyService.applyPenalty({
        astrologerId,
        type: 'missed_appointment',
        amount: 50, // ₹50 penalty for rejecting chat
        reason: 'Chat request rejected',
        description: 'Rejected chat request from user',
        orderId: session.orderId,
        userId: session.userId.toString(),
        appliedBy: 'system',
      });
      this.logger.log(`✅ Penalty applied: ₹50 to astrologer ${astrologerId} for rejecting chat`);
    } catch (error: any) {
      this.logger.error(`❌ Failed to apply penalty: ${error.message}`);
    }

    // Update order (no wallet logic here)
    await this.ordersService.cancelOrder(
      session.orderId,
      session.userId.toString(),
      reason,
      'astrologer'
    );

    // Notify user that astrologer rejected – use "request_rejected"
this.notificationService.sendNotification({
  recipientId: session.userId.toString(),
  recipientModel: 'User',
  type: 'request_rejected',
  title: 'Chat request rejected',
  message: 'Astrologer rejected your chat request. No amount has been charged.',
  data: {
    type: 'request_rejected',
    mode: 'chat',
    sessionId: session.sessionId,
    orderId: session.orderId,
    astrologerId,
    step: 'astrologer_rejected',
  },
  priority: 'medium',
}).catch(err =>
  this.logger.error(`Chat rejected notification error: ${err.message}`),
);


    this.logger.log(`Chat rejected: ${sessionId}`);

    return {
      success: true,
      message: 'Chat rejected'
    };
  }

  // ===== START SESSION (with Kundli message) =====
  async startSession(sessionId: string, userId?: string): Promise<any> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== 'waiting' && session.status !== 'waiting_in_queue') {
      this.logger.warn(`Session ${sessionId} is in status ${session.status}, cannot start`);
      throw new BadRequestException('Session not in valid state to start');
    }

    // Calculate max duration
    const walletBalance = await this.walletService.getBalance(session.userId.toString());
    const maxDurationMinutes = Math.floor(walletBalance / session.ratePerMinute);
    const maxDurationSeconds = maxDurationMinutes * 60;

    if (maxDurationMinutes < 1) {
      throw new BadRequestException('Insufficient balance to start chat');
    }

    // ✅ UPDATE SESSION STATUS TO ACTIVE
    session.status = 'active';
    session.startTime = new Date();
    session.maxDurationMinutes = maxDurationMinutes;
    session.maxDurationSeconds = maxDurationSeconds;
    session.timerStatus = 'running';
    session.timerMetrics.elapsedSeconds = 0;
    session.timerMetrics.remainingSeconds = maxDurationSeconds;
    session.timerMetrics.lastUpdatedAt = new Date();

    await session.save();
    this.clearUserJoinTimeout(sessionId);
    this.logger.log(`✅ Session ${sessionId} status updated to ACTIVE`);

    // ✅ UPDATE ORDER STATUS TO ACTIVE
    await this.ordersService.updateOrderStatus(session.orderId, 'active');
    this.logger.log(`✅ Order ${session.orderId} status updated to ACTIVE`);

    return {
      success: true,
      message: 'Chat session started',
      data: {
        status: 'active',
        maxDurationMinutes,
        maxDurationSeconds,
        ratePerMinute: session.ratePerMinute,
        sendKundliMessage: true
      }
    };
  }

  /**
 * Get astrologer's chat sessions
 */
async getAstrologerChatSessions(
  astrologerId: string,
  filters: {
    page: number;
    limit: number;
    status?: string;
  }
): Promise<any> {
  const query: any = {
    astrologerId: this.toObjectId(astrologerId)
  };

  if (filters.status) {
    query.status = filters.status;
  }

  const skip = (filters.page - 1) * filters.limit;

  const [sessions, total] = await Promise.all([
    this.sessionModel
      .find(query)
      .populate('userId', 'name profileImage phoneNumber')
      .select('sessionId userId ratePerMinute status duration billedMinutes totalAmount startTime endTime createdAt messageCount')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(filters.limit)
      .lean(),
    this.sessionModel.countDocuments(query)
  ]);

  return {
    success: true,
    data: {
      sessions,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        pages: Math.ceil(total / filters.limit)
      }
    }
  };
}

/**
 * Get astrologer chat session details
 */
async getAstrologerChatSessionDetails(
  sessionId: string,
  astrologerId: string
): Promise<any> {
  const session = await this.sessionModel
    .findOne({
      sessionId,
      astrologerId: this.toObjectId(astrologerId)
    })
    .populate('userId', 'name profileImage phoneNumber email')
    .lean();

  if (!session) {
    throw new NotFoundException('Chat session not found');
  }

  return {
    success: true,
    data: {
      session,
    }
  };
}

  // ===== END SESSION =====
  /**
 * END SESSION
 */
async endSession(sessionId: string, endedBy: string, reason: string): Promise<any> {
  const session = await this.sessionModel.findOne({ sessionId });

  if (!session) {
    throw new NotFoundException('Session not found');
  }

  if (session.status === 'ended') {
    this.logger.warn(`⚠️ Session ${sessionId} already ended, returning existing data`);
    return {
      success: true,
      message: 'Session already ended',
      data: {
        sessionId,
        actualDuration: session.duration || 0,
        billedMinutes: session.billedMinutes || 0,
        chargeAmount: session.totalAmount || 0,
        status: 'ended',
      },
    };
  }

  // Clear timeout
  if (this.sessionTimers.has(sessionId)) {
    clearTimeout(this.sessionTimers.get(sessionId)!);
    this.sessionTimers.delete(sessionId);
  }

  this.clearUserJoinTimeout(sessionId);

  let actualDurationSeconds = 0;

  if (session.status === 'active' && session.startTime) {
    const endTime = new Date();
    actualDurationSeconds = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);

    // Cap to max duration if timeout
    if (reason === 'timeout' && actualDurationSeconds > session.maxDurationSeconds) {
      actualDurationSeconds = session.maxDurationSeconds;
    }

    session.duration = actualDurationSeconds;
    session.billedMinutes = Math.ceil(actualDurationSeconds / 60);
    session.totalAmount = session.billedMinutes * session.ratePerMinute;
    session.platformCommission = (session.totalAmount * 40) / 100;
    session.astrologerEarning = session.totalAmount - session.platformCommission;
  }

  // ✅ WALLET DEDUCTION (User) & ASTROLOGER CREDIT
  if (actualDurationSeconds > 0 && session.totalAmount > 0) {
    try {
      // GET USER AND ASTROLOGER DETAILS
      const [user, astrologer] = await Promise.all([
        this.userModel.findById(session.userId).select('name').lean(),
        this.astrologerModel.findById(session.astrologerId).select('name').lean(),
      ]);

      // ✅ USE UNIFIED PAYMENT METHOD
      const paymentResult = await this.walletService.processSessionPayment({
        userId: session.userId.toString(),
        astrologerId: session.astrologerId.toString(),
        amount: session.totalAmount,
        orderId: session.orderId,
        sessionId: session.sessionId,
        sessionType: 'chat',
        userName: user?.name || 'User',
        astrologerName: astrologer?.name || 'Astrologer',
        durationMinutes: session.billedMinutes,
      });

      if (!paymentResult.success) {
        throw new Error(paymentResult.message || 'Payment failed');
      }

      this.logger.log(`✅ User wallet charged: User(${session.userId}) | Amount: ₹${session.totalAmount}`);
      this.logger.log(`✅ Astrologer credited: ${session.astrologerId} | Amount: ₹${session.astrologerEarning}`);

      // ✅ UPDATE ASTROLOGER EARNINGS (using EarningsService)
      await this.earningsService.updateEarnings(
        session.astrologerId.toString(),
        session.totalAmount,
        'chat',
      );

      session.isPaid = true;
    } catch (error: any) {
      this.logger.error(`❌ Payment processing failed for chat session ${sessionId}: ${error.message}`);
      session.isPaid = false;
    }
  }

  session.status = 'ended';
  session.endTime = new Date();
  session.endedBy = endedBy;
  session.endReason = reason;
  session.timerStatus = 'ended';

  const now = new Date();
  session.postSessionWindowEndsAt = new Date(now.getTime() + 20 * 1000);

  await session.save();

  // ONLY complete order if session was active, otherwise cancel
  if (actualDurationSeconds > 0) {
    await this.ordersService.completeSession(session.orderId, {
      sessionId: sessionId,
      sessionType: 'chat',
      actualDurationSeconds: actualDurationSeconds,
      billedMinutes: session.billedMinutes,
      chargedAmount: session.totalAmount,
      recordingUrl: undefined,
      recordingS3Key: undefined,
      recordingDuration: undefined,
    });
  } else {
    this.logger.log(`Session ${sessionId} never started, cancelling order`);
    await this.ordersService.cancelOrder(
      session.orderId,
      session.userId.toString(),
      reason,
      'system',
    );
  }

  this.logger.log(`Chat session ended: ${sessionId} | Duration: ${actualDurationSeconds}s`);

  // ✅ CRITICAL FIX: ADD RETURN STATEMENT
  return {
    success: true,
    message: 'Chat session ended',
    data: {
      sessionId,
      actualDuration: actualDurationSeconds,
      billedMinutes: session.billedMinutes,
      chargeAmount: session.totalAmount,
      status: 'ended',
    },
  };
}

  // ===== REQUEST TIMEOUT (3 mins) =====
  private setRequestTimeout(sessionId: string, orderId: string, userId: string) {
    const timeout = setTimeout(async () => {
      try {
        const session = await this.sessionModel.findOne({ sessionId });
        if (!session || (session.status !== 'initiated' && session.status !== 'waiting')) {
          return;
        }

        session.status = 'cancelled';
        session.endReason = 'astrologer_no_response';
        session.endTime = new Date();
        await session.save();

        // ✅ NEW: Apply penalty for no response
        try {
          await this.penaltyService.applyPenalty({
            astrologerId: session.astrologerId.toString(),
            type: 'late_response',
            amount: 100, // ₹100 penalty for not responding
            reason: 'No response to chat request',
            description: 'Did not respond to chat request within 3 minutes',
            orderId: session.orderId,
            userId: session.userId.toString(),
            appliedBy: 'system',
          });
          this.logger.log(`✅ Penalty applied: ₹100 to astrologer for no response`);
        } catch (error: any) {
          this.logger.error(`❌ Failed to apply penalty: ${error.message}`);
        }

        // Update order (this will send a timeout notification with "no charge" wording)
        await this.ordersService.handleOrderTimeout(orderId);

        this.logger.log(`Chat request timeout: ${sessionId}`);
        this.sessionTimers.delete(sessionId);
      } catch (error: any) {
        this.logger.error(`Timeout handler error for ${sessionId}: ${error.message}`);
      }
    }, 3 * 60 * 1000);

    this.sessionTimers.set(sessionId, timeout);
  }

  // ===== AUTO-END TIMER =====
  private setAutoEndTimer(sessionId: string, maxDurationSeconds: number) {
    const timeout = setTimeout(async () => {
      try {
        await this.endSession(sessionId, 'system', 'timeout');
        this.sessionTimers.delete(sessionId);
      } catch (error: any) {
        this.logger.error(`Auto-end error for ${sessionId}: ${error.message}`);
      }
    }, maxDurationSeconds * 1000);

    this.sessionTimers.set(sessionId, timeout);
  }

  // ===== USER JOIN TIMEOUT (60 sec after astrologer accepts) =====
  private setUserJoinTimeout(sessionId: string) {
    // Clear any existing join timer first
    if (this.joinTimers.has(sessionId)) {
      clearTimeout(this.joinTimers.get(sessionId)!);
      this.joinTimers.delete(sessionId);
    }

    const timeout = setTimeout(async () => {
      try {
        const session = await this.sessionModel.findOne({ sessionId });

        if (!session) {
          return;
        }

        // Only act if user never joined (still not active)
        if (session.status === 'waiting' || session.status === 'waiting_in_queue') {
          this.logger.warn(`User did not join chat within 60s for session ${sessionId}`);

          // This will compute 0 duration and will NOT charge wallet
          await this.endSession(sessionId, 'system', 'user_no_show');
        }

        this.joinTimers.delete(sessionId);
      } catch (error: any) {
        this.logger.error(`User-join timeout error for ${sessionId}: ${error.message}`);
      }
    }, 60 * 1000); // 60 seconds

    this.joinTimers.set(sessionId, timeout);
  }

  private clearUserJoinTimeout(sessionId: string) {
    if (this.joinTimers.has(sessionId)) {
      clearTimeout(this.joinTimers.get(sessionId)!);
      this.joinTimers.delete(sessionId);
    }
  }

  // ===== GET SESSION =====
  async getSession(sessionId: string): Promise<ChatSessionDocument | null> {
    return this.sessionModel.findOne({ sessionId });
  }

  // ===== GET ACTIVE SESSIONS =====
  async getUserActiveSessions(userId: string): Promise<ChatSessionDocument[]> {
    return this.sessionModel
      .find({
        userId: this.toObjectId(userId),
        status: { $in: ['initiated', 'waiting', 'waiting_in_queue', 'active'] }
      })
      .populate('astrologerId', 'name profilePicture isOnline')
      .sort({ createdAt: -1 });
  }

  // ===== GET CHAT HISTORY =====
  async getChatHistory(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<any> {
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this.sessionModel
        .find({
          userId: this.toObjectId(userId),
          status: { $in: ['ended', 'cancelled', 'rejected'] }
        })
        .populate('astrologerId', 'name profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.sessionModel.countDocuments({
        userId: this.toObjectId(userId),
        status: { $in: ['ended', 'cancelled', 'rejected'] }
      })
    ]);

    return {
      sessions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // ===== UPDATE ONLINE STATUS =====
  async updateOnlineStatus(
    sessionId: string,
    userId: string,
    role: 'user' | 'astrologer',
    isOnline: boolean
  ): Promise<void> {
    const updateField = role === 'user' ? 'userStatus' : 'astrologerStatus';

    await this.sessionModel.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          [`${updateField}.isOnline`]: isOnline,
          [`${updateField}.lastSeen`]: isOnline ? null : new Date()
        }
      }
    );
  }

  // ===== UPDATE LAST MESSAGE =====
  async updateLastMessage(
    sessionId: string,
    content: string,
    type: string,
    sentBy: string
  ): Promise<void> {
    await this.sessionModel.findOneAndUpdate(
      { sessionId },
      {
        $set: {
          lastMessage: {
            content,
            type,
            sentBy,
            sentAt: new Date()
          },
          lastMessageAt: new Date()
        },
        $inc: { messageCount: 1 }
      }
    );
  }

  // ===== CONTINUE EXISTING CHAT =====
  async continueChat(data: {
    userId: string;
    astrologerId: string;
    previousSessionId: string;
    ratePerMinute: number;
  }): Promise<any> {
    // Check balance (same logic as initiateChat)
    const estimatedCost = data.ratePerMinute * 5;
    const hasBalance = await this.walletService.checkBalance(data.userId, estimatedCost);

    if (!hasBalance) {
      throw new BadRequestException(
        `Insufficient balance. Minimum ₹${estimatedCost} required to continue chat.`
      );
    }

    // FIND CONVERSATION THREAD
    const conversationThread = await this.ordersService.findOrCreateConversationThread(
      data.userId,
      data.astrologerId,
      '', // Will get from existing thread
      data.ratePerMinute
    );

    const astrologerName = conversationThread.astrologerName || 'Astrologer';

    this.logger.log(`Continuing conversation thread: ${conversationThread.orderId}`);

    // NEW SESSION ID
    const newSessionId = this.generateSessionId();

    // Create "order" entry (updates conversation thread)
    const order = await this.ordersService.createOrder({
      userId: data.userId,
      astrologerId: data.astrologerId,
      astrologerName: astrologerName,
      type: 'chat',
      ratePerMinute: data.ratePerMinute,
      sessionId: newSessionId,
    });

    // CALCULATE SESSION NUMBER
    const sessionNumber = conversationThread.sessionHistory.filter(s => s.sessionType === 'chat').length + 1;

    // CREATE NEW CHAT SESSION (same lifecycle as a fresh chat)
    const session = new this.sessionModel({
      sessionId: newSessionId,
      userId: this.toObjectId(data.userId),
      astrologerId: this.toObjectId(data.astrologerId),
      orderId: conversationThread.orderId,
      conversationThreadId: conversationThread.conversationThreadId,
      sessionNumber,
      ratePerMinute: data.ratePerMinute,
      status: 'initiated',
      requestCreatedAt: new Date(),
      ringTime: new Date(),
      maxDurationMinutes: 0,
      maxDurationSeconds: 0,
      timerStatus: 'not_started',
      timerMetrics: {
        elapsedSeconds: 0,
        remainingSeconds: 0
      },
      previousSessionId: data.previousSessionId || undefined,
    });

    await session.save();

    // ✅ Same 3-min timeout behaviour as initiateChat
    this.setRequestTimeout(newSessionId, conversationThread.orderId, data.userId);

    this.logger.log(
      `Chat continuation created: ${newSessionId} | Thread: ${conversationThread.conversationThreadId} | Session #${sessionNumber}`,
    );

    // Notify astrologer – continuation is also an incoming chat request
this.notificationService.sendNotification({
  recipientId: data.astrologerId,
  recipientModel: 'Astrologer',
  type: 'chat_request',
  title: 'Chat continued',
  message: 'User wants to continue the conversation.',
  data: {
    type: 'chat_request',
    mode: 'chat',
    sessionId: newSessionId,
    orderId: conversationThread.orderId,
    conversationThreadId: conversationThread.conversationThreadId,
    userId: data.userId,
    previousSessionId: data.previousSessionId,
    sessionNumber,
    ratePerMinute: data.ratePerMinute,
    step: 'chat_continued',
    fullScreen: 'true',
  },
  priority: 'high',
}).catch(err =>
  this.logger.error(`Chat continue notification error: ${err.message}`),
);


    return {
      success: true,
      message: 'Chat continuation initiated',
      data: {
        sessionId: newSessionId,
        orderId: conversationThread.orderId,
        conversationThreadId: conversationThread.conversationThreadId,
        sessionNumber,
        status: 'initiated',
        ratePerMinute: data.ratePerMinute,
        previousSessionId: data.previousSessionId,
        totalPreviousSessions: conversationThread.totalSessions,
        totalSpent: conversationThread.totalAmount,
      }
    };
  }
}
