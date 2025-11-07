// src/chat/services/chat-session.service.ts

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatSession, ChatSessionDocument } from '../schemas/chat-session.schema';
import { OrdersService } from '../../orders/services/orders.service';
import { OrderPaymentService } from '../../orders/services/order-payment.service';
import { WalletService } from '../../payments/services/wallet.service';

@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);
  private sessionTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(ChatSession.name) private sessionModel: Model<ChatSessionDocument>,
    private ordersService: OrdersService,
    private orderPaymentService: OrderPaymentService,
    private walletService: WalletService
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

    // Create order with HOLD payment
    const order = await this.ordersService.createOrder({
      userId: sessionData.userId,
      astrologerId: sessionData.astrologerId,
      astrologerName: sessionData.astrologerName,
      type: 'chat',
      ratePerMinute: sessionData.ratePerMinute,
      sessionId: sessionId
    });

    // Create chat session (INITIATED)
    const session = new this.sessionModel({
      sessionId,
      userId: this.toObjectId(sessionData.userId),
      astrologerId: this.toObjectId(sessionData.astrologerId),
      orderId: order.orderId,
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

    this.logger.log(`Chat initiated: ${sessionId} | Order: ${order.orderId}`);

    return {
      success: true,
      message: 'Chat initiated - waiting for astrologer',
      data: {
        sessionId: session.sessionId,
        orderId: order.orderId,
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
      `Rejected: ${reason}`
    );

    session.status = 'rejected';
    session.endedBy = astrologerId;
    session.endReason = reason;
    session.endTime = new Date();
    await session.save();

    // Update order
    await this.ordersService.cancelOrder(
      session.orderId,
      session.userId.toString(),
      reason,
      'astrologer'
    );

    this.logger.log(`Chat rejected: ${sessionId}`);

    return {
      success: true,
      message: 'Chat rejected and refunded'
    };
  }

  // ===== START SESSION =====
  // ===== START SESSION (with Kundli message) =====
async startSession(sessionId: string, userId?: string): Promise<any> {
  const session = await this.sessionModel.findOne({ sessionId });
  if (!session) {
    throw new NotFoundException('Session not found');
  }

  if (session.status !== 'waiting' && session.status !== 'waiting_in_queue') {
    throw new BadRequestException('Session not in valid state to start');
  }

  // Calculate max duration (full minutes only)
  const walletBalance = await this.walletService.getBalance(session.userId.toString());
  const maxDurationMinutes = Math.floor(walletBalance / session.ratePerMinute);
  const maxDurationSeconds = maxDurationMinutes * 60;

  if (maxDurationMinutes < 1) {
    throw new BadRequestException('Insufficient balance to start chat');
  }

  // Transition to ACTIVE
  session.status = 'active';
  session.startTime = new Date();
  session.maxDurationMinutes = maxDurationMinutes;
  session.maxDurationSeconds = maxDurationSeconds;
  session.timerStatus = 'running';
  session.timerMetrics.elapsedSeconds = 0;
  session.timerMetrics.remainingSeconds = maxDurationSeconds;
  session.timerMetrics.lastUpdatedAt = new Date();

  await session.save();

  // Update order status
  await this.ordersService.updateOrderStatus(session.orderId, 'active');

  // ✅ SEND KUNDLI DETAILS MESSAGE (even if continuing)
  // This will be sent from gateway with user data
  this.logger.log(
    `Chat session started: ${sessionId} | Max Duration: ${maxDurationMinutes} mins`
  );

  return {
    success: true,
    message: 'Chat session started',
    data: {
      status: 'active',
      maxDurationMinutes,
      maxDurationSeconds,
      ratePerMinute: session.ratePerMinute,
      sendKundliMessage: true // ✅ Signal to gateway to send kundli
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

  // Calculate actual duration only if session was ACTIVE
  if (session.status === 'active' && session.startTime) {
    const endTime = new Date();
    actualDurationSeconds = Math.floor(
      (endTime.getTime() - session.startTime.getTime()) / 1000
    );

    // Cap to max duration if timeout
    if (reason === 'timeout' && actualDurationSeconds > session.maxDurationSeconds) {
      actualDurationSeconds = session.maxDurationSeconds;
    }

    session.duration = actualDurationSeconds;
    session.billedMinutes = Math.ceil(actualDurationSeconds / 60);
    session.totalAmount = session.billedMinutes * session.ratePerMinute;
    session.platformCommission = (session.totalAmount * 20) / 100;
    session.astrologerEarning = session.totalAmount - session.platformCommission;

    // CHARGE from hold
    try {
      await this.orderPaymentService.chargeFromHold(
        session.orderId,
        session.userId.toString(),
        actualDurationSeconds,
        session.ratePerMinute
      );

      session.isPaid = true;
      session.paidAt = new Date();

      this.logger.log(
        `Chat charged: ${sessionId} | Actual: ${actualDurationSeconds}s | Billed: ${session.billedMinutes}m | Amount: ₹${session.totalAmount}`
      );
    } catch (error: any) {
      this.logger.error(`Payment failed for chat ${sessionId}: ${error.message}`);
      throw error;
    }
  }

  session.status = 'ended';
  session.endTime = new Date();
  session.endedBy = endedBy;
  session.endReason = reason;
  session.timerStatus = 'ended';

  await session.save();

  // ✅ FIXED: Use correct method name
  await this.ordersService.completeSession(session.orderId, {
    sessionId,
    sessionType: 'chat',
    actualDurationSeconds,
    recordingUrl: undefined
  });

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
          'timeout - astrologer no response'
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
  
}
