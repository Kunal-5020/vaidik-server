import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChatSession, ChatSessionDocument } from '../schemas/chat-session.schema';

@Injectable()
export class ChatSessionService {
  constructor(
    @InjectModel(ChatSession.name) private chatSessionModel: Model<ChatSessionDocument>,
  ) {}

  async createSession(userId: string, astrologerId: string): Promise<ChatSession> {
    const existing = await this.chatSessionModel.findOne({ userId, astrologerId, status: 'active' });
    if (existing) {
      return existing;
    }

    const newSession = new this.chatSessionModel({
      userId: new Types.ObjectId(userId),
      astrologerId: new Types.ObjectId(astrologerId),
      sessionType: 'chat',
      status: 'active',
      startedAt: new Date()
    });

    await newSession.save();
    return newSession;
  }

  async endSession(sessionId: string): Promise<void> {
    const session = await this.chatSessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Session not found');

    session.status = 'ended';
    session.endedAt = new Date();
    await session.save();
  }

  async getSession(sessionId: string): Promise<ChatSession> {
    const session = await this.chatSessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    return session;
  }

  async getUserSessions(userId: string): Promise<ChatSession[]> {
    return this.chatSessionModel.find({ userId: new Types.ObjectId(userId) });
  }
}
