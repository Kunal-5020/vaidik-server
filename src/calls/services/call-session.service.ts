import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CallSession, CallSessionDocument } from '../schemas/call-session.schema';
import { AgoraService } from './agora.service';

@Injectable()
export class CallSessionService {
  constructor(
    @InjectModel(CallSession.name) private sessionModel: Model<CallSessionDocument>,
    private agoraService: AgoraService,
  ) {}

  async createSession(sessionData: {
    userId: string;
    astrologerId: string;
    orderId: string;
    callType: 'audio' | 'video';
    ratePerMinute: number;
  }): Promise<any> {
    const sessionId = `CALL_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    // Generate Agora channel and token
    const channelName = this.agoraService.generateChannelName();
    const uid = this.agoraService.generateUid();
    const token = this.agoraService.generateRtcToken(channelName, uid, 'publisher', 3600);

    const session = new this.sessionModel({
      sessionId,
      userId: sessionData.userId,
      astrologerId: sessionData.astrologerId,
      orderId: sessionData.orderId,
      callType: sessionData.callType,
      ratePerMinute: sessionData.ratePerMinute,
      status: 'initiated',
      agoraChannelName: channelName,
      agoraToken: token,
      agoraUid: uid,
      createdAt: new Date()
    });

    await session.save();

    return {
      sessionId: session.sessionId,
      channelName: session.agoraChannelName,
      token: session.agoraToken,
      uid: session.agoraUid,
      appId: this.agoraService.getAppId(),
      callType: session.callType,
    };
  }

  async updateStatus(
    sessionId: string,
    status: 'ringing' | 'active' | 'ended' | 'cancelled' | 'missed' | 'rejected'
  ): Promise<CallSessionDocument> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    session.status = status;

    if (status === 'ringing' && !session.ringTime) {
      session.ringTime = new Date();
    }

    if (status === 'active' && !session.answerTime) {
      session.answerTime = new Date();
      session.startTime = new Date();
    }

    await session.save();
    return session;
  }

  async endSession(
    sessionId: string,
    endedBy: string,
    reason: string
  ): Promise<CallSessionDocument> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const endTime = new Date();
    let duration = 0;

    // Calculate duration only if call was active
    if (session.startTime && session.status === 'active') {
      duration = Math.floor((endTime.getTime() - session.startTime.getTime()) / 1000);
    }

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

  async getSession(sessionId: string): Promise<CallSessionDocument | null> {
    return this.sessionModel.findOne({ sessionId });
  }

  async getUserActiveSessions(userId: string): Promise<CallSessionDocument[]> {
    return this.sessionModel.find({
      userId,
      status: { $in: ['initiated', 'ringing', 'active'] }
    }).sort({ createdAt: -1 });
  }

  async getAstrologerActiveSessions(astrologerId: string): Promise<CallSessionDocument[]> {
    return this.sessionModel.find({
      astrologerId,
      status: { $in: ['initiated', 'ringing', 'active'] }
    }).sort({ createdAt: -1 });
  }

  // Regenerate token if expired
  async regenerateToken(sessionId: string): Promise<string> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (!session.agoraChannelName || !session.agoraUid) {
      throw new BadRequestException('Invalid session data');
    }

    const newToken = this.agoraService.generateRtcToken(
      session.agoraChannelName,
      session.agoraUid,
      'publisher',
      3600
    );

    session.agoraToken = newToken;
    await session.save();

    return newToken;
  }

  // Get call history
  async getCallHistory(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<any> {
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this.sessionModel
        .find({
          $or: [{ userId }, { astrologerId: userId }],
          status: { $in: ['ended', 'missed', 'rejected', 'cancelled'] }
        })
        .populate('userId', 'name profileImage')
        .populate('astrologerId', 'name profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.sessionModel.countDocuments({
        $or: [{ userId }, { astrologerId: userId }],
        status: { $in: ['ended', 'missed', 'rejected', 'cancelled'] }
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
