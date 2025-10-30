// src/chat/services/chat-session.service.ts

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatSession, ChatSessionDocument } from '../schemas/chat-session.schema';
import { OrdersService } from '../../orders/services/orders.service';
import { WalletService } from '../../payments/services/wallet.service';

@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);

  constructor(
    @InjectModel(ChatSession.name) private sessionModel: Model<ChatSessionDocument>,
    private ordersService: OrdersService,
    private walletService: WalletService
  ) {}

  // Generate session ID
  private generateSessionId(): string {
    return `CHAT_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
  }

  // ✅ UPDATED: Create session with order
  async createSession(sessionData: {
    userId: string;
    astrologerId: string;
    astrologerName: string;
    ratePerMinute: number;
  }): Promise<any> {
    // Check wallet balance
    const estimatedCost = sessionData.ratePerMinute; // Minimum 1 minute
    const hasBalance = await this.walletService.checkBalance(sessionData.userId, estimatedCost);
    
    if (!hasBalance) {
      throw new BadRequestException(
        `Insufficient balance. Minimum ₹${estimatedCost} required to start chat.`
      );
    }

    const sessionId = this.generateSessionId();

    // ✅ Create order first
    const order = await this.ordersService.createOrder({
      userId: sessionData.userId,
      astrologerId: sessionData.astrologerId,
      astrologerName: sessionData.astrologerName,
      type: 'chat',
      ratePerMinute: sessionData.ratePerMinute,
      sessionId: sessionId
    });

    const session = new this.sessionModel({
      sessionId,
      userId: sessionData.userId,
      astrologerId: sessionData.astrologerId,
      orderId: order.orderId,
      ratePerMinute: sessionData.ratePerMinute,
      status: 'waiting',
      messageCount: 0,
      createdAt: new Date()
    });

    await session.save();

    this.logger.log(`Chat session created: ${sessionId} | Order: ${order.orderId}`);

    return {
      sessionId: session.sessionId,
      orderId: order.orderId,
      ratePerMinute: session.ratePerMinute,
      status: session.status
    };
  }

  // Start session
  async startSession(sessionId: string): Promise<ChatSessionDocument> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== 'waiting') {
      throw new BadRequestException('Session already started or ended');
    }

    session.status = 'active';
    session.startTime = new Date();
    await session.save();

    // ✅ Update order status
    await this.ordersService.updateOrderStatus(session.orderId, 'ongoing');

    this.logger.log(`Chat session started: ${sessionId}`);

    return session;
  }

  // ✅ ENHANCED: End session with billing
  async endSession(
    sessionId: string,
    endedBy: string,
    reason?: string
  ): Promise<ChatSessionDocument> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const endTime = new Date();
    let duration = 0;

    if (session.startTime && session.status === 'active') {
      duration = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);
    }

    // Calculate billing
    const billedMinutes = Math.ceil(duration / 60);
    const totalAmount = billedMinutes * session.ratePerMinute;
    const platformCommission = (totalAmount * 20) / 100;
    const astrologerEarning = totalAmount - platformCommission;

    session.status = 'ended';
    session.endTime = endTime;
    session.duration = duration;
    session.billedDuration = billedMinutes * 60;
    session.totalAmount = totalAmount;
    session.platformCommission = platformCommission;
    session.astrologerEarning = astrologerEarning;
    session.endedBy = endedBy;
    session.endReason = reason;

    await session.save();

    // ✅ Complete order
    await this.ordersService.completeOrder(session.orderId, {
      duration,
      totalAmount,
      endTime
    });

    // ✅ Process payment from wallet
    if (totalAmount > 0) {
      try {
        await this.walletService.deductFromWallet(
          session.userId.toString(),
          totalAmount,
          session.orderId,
          `Chat session - ${billedMinutes} min(s)`
        );

        session.isPaid = true;
        session.paidAt = new Date();
        await session.save();

        this.logger.log(`Payment processed: ${sessionId} | Amount: ₹${totalAmount}`);
      } catch (error: any) {
        this.logger.error(`Payment failed for session ${sessionId}: ${error.message}`);
      }
    }

    this.logger.log(`Chat ended: ${sessionId} | Duration: ${duration}s | Amount: ₹${totalAmount}`);

    return session;
  }

  // ✅ NEW: Update last message preview
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

  // ✅ NEW: Update online status
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

  // Update message count (legacy - replaced by updateLastMessage)
  async updateMessageCount(sessionId: string): Promise<void> {
    await this.sessionModel.findOneAndUpdate(
      { sessionId },
      {
        $inc: { messageCount: 1 },
        $set: { lastMessageAt: new Date() }
      }
    );
  }

  // Get session
  async getSession(sessionId: string): Promise<ChatSessionDocument | null> {
    return this.sessionModel.findOne({ sessionId });
  }

  // Get active sessions
  async getUserActiveSessions(userId: string): Promise<ChatSessionDocument[]> {
    return this.sessionModel
      .find({
        userId,
        status: { $in: ['waiting', 'active'] }
      })
      .populate('astrologerId', 'name profilePicture isOnline')
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .lean();
  }

  async getAstrologerActiveSessions(astrologerId: string): Promise<ChatSessionDocument[]> {
    return this.sessionModel
      .find({
        astrologerId,
        status: { $in: ['waiting', 'active'] }
      })
      .populate('userId', 'name profileImage')
      .sort({ lastMessageAt: -1, createdAt: -1 })
      .lean();
  }

  // ✅ NEW: Get chat history
  async getChatHistory(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<any> {
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this.sessionModel
        .find({
          $or: [{ userId }, { astrologerId: userId }],
          status: { $in: ['ended', 'cancelled'] }
        })
        .populate('userId', 'name profileImage')
        .populate('astrologerId', 'name profilePicture')
        .sort({ lastMessageAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.sessionModel.countDocuments({
        $or: [{ userId }, { astrologerId: userId }],
        status: { $in: ['ended', 'cancelled'] }
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
}
