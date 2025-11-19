// src/chat/services/chat-session.service.ts

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatSession, ChatSessionDocument } from '../schemas/chat-session.schema';
import { OrdersService } from '../../orders/services/orders.service';
import { OrderPaymentService } from '../../orders/services/order-payment.service';
import { WalletService } from '../../payments/services/wallet.service';
import { NotificationService } from '../../notifications/services/notification.service';


@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);
  private sessionTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(ChatSession.name) private sessionModel: Model<ChatSessionDocument>,
    private ordersService: OrdersService,
    private orderPaymentService: OrderPaymentService,
    private walletService: WalletService,
    private notificationService: NotificationService,
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
  console.log(sessionId, "generated session id");

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
    this.logger.error(`Order creation failed`);
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
    orderId: order.orderId, // ✅ This is the conversation thread orderId
    conversationThreadId: order.conversationThreadId, // ✅ NEW
    sessionNumber, // ✅ NEW: 1st chat, 2nd chat, etc.
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

  // ✅ Fire-and-forget notification
  this.notificationService.sendNotification({
    recipientId: sessionData.astrologerId,
    recipientModel: 'Astrologer',
    type: 'chat_message',
    title: 'New chat request',
    message: `You have a new chat request from a user.`,
    data: {
      mode: 'chat',
      sessionId,
      orderId: order.orderId,
      conversationThreadId: order.conversationThreadId, // ✅ NEW
      userId: sessionData.userId,
      astrologerId: sessionData.astrologerId,
      ratePerMinute: sessionData.ratePerMinute,
      step: 'user_initiated',
      fullScreen: true,
    },
    priority: 'high',
  }).catch(err => this.logger.error(`Chat incoming notification error: ${err.message}`));

  this.logger.log(`Chat initiated: ${sessionId} | Thread: ${order.conversationThreadId} | Session #${sessionNumber}`);

  return {
    success: true,
    message: 'Chat initiated - waiting for astrologer',
    data: {
      sessionId: session.sessionId,
      orderId: order.orderId,
      conversationThreadId: order.conversationThreadId, // ✅ NEW
      sessionNumber, // ✅ NEW
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

    // Notify user that astrologer accepted
this.notificationService.sendNotification({
  recipientId: session.userId.toString(),
  recipientModel: 'User',
  type: 'chat_message',
  title: 'Astrologer accepted your chat',
  message: 'Tap to start your chat session.',
  data: {
    mode: 'chat',
    sessionId: session.sessionId,
    orderId: session.orderId,
    astrologerId,
    step: 'astrologer_accepted',
    fullScreen: true,
  },
  priority: 'high',
}).catch(err => this.logger.error(`Chat accepted notification error: ${err.message}`));

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

    // Refund hold
    await this.orderPaymentService.refundHold(
  session.orderId,
  session.userId.toString(),
  'astrologer_rejected'
);

session.status = 'rejected';
session.endedBy = astrologerId;
session.endReason = 'astrologer_rejected';

    session.endTime = new Date();
    await session.save();

    // Update order
    await this.ordersService.cancelOrder(
      session.orderId,
      session.userId.toString(),
      reason,
      'astrologer'
    );

    // Notify user that astrologer rejected
this.notificationService.sendNotification({
  recipientId: session.userId.toString(),
  recipientModel: 'User',
  type: 'chat_message',
  title: 'Chat request rejected',
  message: 'Astrologer rejected your chat request. Amount has been refunded to your wallet.',
  data: {
    mode: 'chat',
    sessionId: session.sessionId,
    orderId: session.orderId,
    astrologerId,
    step: 'astrologer_rejected',
  },
  priority: 'medium',
}).catch(err => this.logger.error(`Chat rejected notification error: ${err.message}`));


    this.logger.log(`Chat rejected: ${sessionId}`);

    return {
      success: true,
      message: 'Chat rejected and refunded'
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

  // ===== END SESSION =====
  async endSession(
  sessionId: string,
  endedBy: string,
  reason: string
): Promise<any> {
  const session = await this.sessionModel.findOne({ sessionId });
  if (!session) {
    throw new NotFoundException('Session not found');
  }

  // Clear timeout
  if (this.sessionTimers.has(sessionId)) {
    clearTimeout(this.sessionTimers.get(sessionId)!);
    this.sessionTimers.delete(sessionId);
  }

  let actualDurationSeconds = 0;

  // ✅ ONLY calculate duration if session was actually ACTIVE
  if (session.status === 'active' && session.startTime) {
    const endTime = new Date();
    actualDurationSeconds = Math.floor(
      (endTime.getTime() - session.startTime.getTime()) / 1000
    );

    if (reason === 'timeout' && actualDurationSeconds > session.maxDurationSeconds) {
      actualDurationSeconds = session.maxDurationSeconds;
    }

    session.duration = actualDurationSeconds;
    session.billedMinutes = Math.ceil(actualDurationSeconds / 60);
    session.totalAmount = session.billedMinutes * session.ratePerMinute;
    session.platformCommission = (session.totalAmount * 20) / 100;
    session.astrologerEarning = session.totalAmount - session.platformCommission;

    this.logger.log(
      `Chat billing prepared: ${sessionId} | Actual: ${actualDurationSeconds}s | Billed: ${session.billedMinutes}m | Amount: ₹${session.totalAmount}`
    );
  } else {
    // ✅ Session ended before becoming active (e.g., rejected, timeout, cancelled)
    this.logger.warn(`Session ${sessionId} ended without being active (status: ${session.status})`);
  }

  session.status = 'ended';
  session.endTime = new Date();
  session.endedBy = endedBy;
  session.endReason = reason;
  session.timerStatus = 'ended';

  await session.save();

  // ✅ ONLY complete order if session was active, otherwise cancel/refund
  if (actualDurationSeconds > 0) {
    await this.ordersService.completeSession(session.orderId, {
      sessionId,
      sessionType: 'chat',
      actualDurationSeconds,
      recordingUrl: undefined
    });
  } else {
    // Session never started, refund the hold
    this.logger.log(`Session ${sessionId} never started, refunding hold`);
    await this.orderPaymentService.refundHold(
      session.orderId,
      session.userId.toString(),
      reason
    );
    await this.ordersService.cancelOrder(
      session.orderId,
      session.userId.toString(),
      reason,
      'system'
    );
  }

  this.logger.log(`Chat session ended: ${sessionId} | Duration: ${actualDurationSeconds}s`);

  return {
    success: true,
    message: 'Chat session ended',
    data: {
      sessionId,
      actualDuration: actualDurationSeconds,
      billedMinutes: session.billedMinutes,
      chargeAmount: session.totalAmount,
      status: 'ended'
    }
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

        // Refund hold on timeout
        await this.orderPaymentService.refundHold(
  orderId,
  userId,
  'astrologer_no_response'
);

session.status = 'cancelled';
session.endReason = 'astrologer_no_response';

        session.endTime = new Date();
        await session.save();

        // Update order
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
      .sort({ createdAt: -1 })
      .lean();
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
      `Insufficient balance. Minimum 78907 required to continue chat.`
    );
  }

  // 75 FIND CONVERSATION THREAD
  const conversationThread = await this.ordersService.findOrCreateConversationThread(
    data.userId,
    data.astrologerId,
    '', // Will get from existing thread
    data.ratePerMinute
  );

  const astrologerName = conversationThread.astrologerName || 'Astrologer';

  this.logger.log(`Continuing conversation thread: ${conversationThread.orderId}`);

  // 75 NEW SESSION ID
  const newSessionId = this.generateSessionId();

  // Create \"order\" entry (updates conversation thread)
  const order = await this.ordersService.createOrder({
    userId: data.userId,
    astrologerId: data.astrologerId,
    astrologerName: astrologerName,
    type: 'chat',
    ratePerMinute: data.ratePerMinute,
    sessionId: newSessionId,
  });

  // 75 CALCULATE SESSION NUMBER
  const sessionNumber = conversationThread.sessionHistory.filter(s => s.sessionType === 'chat').length + 1;

  // 75 CREATE NEW CHAT SESSION (same lifecycle as a fresh chat)
  const session = new this.sessionModel({
    sessionId: newSessionId,
    userId: this.toObjectId(data.userId),
    astrologerId: this.toObjectId(data.astrologerId),
    orderId: conversationThread.orderId,
    conversationThreadId: conversationThread.conversationThreadId,
    sessionNumber,
    ratePerMinute: data.ratePerMinute,
    status: 'initiated', // ✅ same as initiateChat
    requestCreatedAt: new Date(),
    ringTime: new Date(),
    maxDurationMinutes: 0,
    maxDurationSeconds: 0,
    timerStatus: 'not_started',
    timerMetrics: {
      elapsedSeconds: 0,
      remainingSeconds: 0
    },
    previousSessionId: data.previousSessionId || undefined, // ✅ Optional now
  });

  await session.save();

  // ✅ Same 3-min timeout behaviour as initiateChat
  this.setRequestTimeout(newSessionId, conversationThread.orderId, data.userId);

  this.logger.log(`Chat continuation created: ${newSessionId} | Thread: ${conversationThread.conversationThreadId} | Session #${sessionNumber}`);

  // 75 Notify astrologer (push/in-app)
  this.notificationService.sendNotification({
    recipientId: data.astrologerId,
    recipientModel: 'Astrologer',
    type: 'chat_message',
    title: 'Chat Continued',
    message: 'User wants to continue the conversation',
    data: {
      mode: 'chat',
      sessionId: newSessionId,
      orderId: conversationThread.orderId,
      conversationThreadId: conversationThread.conversationThreadId,
      userId: data.userId,
      previousSessionId: data.previousSessionId,
      sessionNumber,
      step: 'chat_continued',
    },
    priority: 'high',
  }).catch(err => this.logger.error(`Chat continue notification error: ${err.message}`));

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
