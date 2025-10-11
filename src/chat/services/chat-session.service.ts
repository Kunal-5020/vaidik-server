import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatSession, ChatSessionDocument } from '../schemas/chat-session.schema';

@Injectable()
export class ChatSessionService {
  constructor(
    @InjectModel(ChatSession.name) private sessionModel: Model<ChatSessionDocument>,
  ) {}

  async createSession(sessionData: {
    userId: string;
    astrologerId: string;
    orderId: string;
    ratePerMinute: number;
  }): Promise<ChatSessionDocument> {
    const sessionId = `CHAT_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    const session = new this.sessionModel({
      sessionId,
      userId: sessionData.userId,
      astrologerId: sessionData.astrologerId,
      orderId: sessionData.orderId,
      ratePerMinute: sessionData.ratePerMinute,
      status: 'waiting',
      createdAt: new Date()
    });

    await session.save();
    return session;
  }

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

    return session;
  }

  async endSession(sessionId: string, endedBy: string, reason?: string): Promise<ChatSessionDocument> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== 'active') {
      throw new BadRequestException('Session is not active');
    }

    const endTime = new Date();
    const duration = session.startTime 
      ? Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000)
      : 0;

    const durationMinutes = Math.ceil(duration / 60);
    const totalAmount = durationMinutes * session.ratePerMinute;

    session.status = 'ended';
    session.endTime = endTime;
    session.duration = duration;
    session.totalAmount = totalAmount;
    session.endedBy = endedBy;
    session.endReason = reason;

    await session.save();
    return session;
  }

  async updateMessageCount(sessionId: string): Promise<void> {
    await this.sessionModel.findOneAndUpdate(
      { sessionId },
      {
        $inc: { messageCount: 1 },
        $set: { lastMessageAt: new Date() }
      }
    );
  }

  async getSession(sessionId: string): Promise<ChatSessionDocument | null> {
    return this.sessionModel.findOne({ sessionId });
  }

  async getUserActiveSessions(userId: string): Promise<ChatSessionDocument[]> {
    return this.sessionModel.find({
      userId,
      status: { $in: ['waiting', 'active'] }
    }).sort({ createdAt: -1 });
  }

  async getAstrologerActiveSessions(astrologerId: string): Promise<ChatSessionDocument[]> {
    return this.sessionModel.find({
      astrologerId,
      status: { $in: ['waiting', 'active'] }
    }).sort({ createdAt: -1 });
  }
}
