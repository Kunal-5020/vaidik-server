// src/calls/services/call-session.service.ts

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CallSession, CallSessionDocument } from '../schemas/call-session.schema';
import { OrdersService } from '../../orders/services/orders.service';
import { WalletService } from '../../payments/services/wallet.service';
import { AgoraService } from './agora.service';
import { CallRecordingService } from './call-recording.service';

@Injectable()
export class CallSessionService {
  private readonly logger = new Logger(CallSessionService.name);

  constructor(
    @InjectModel(CallSession.name) private sessionModel: Model<CallSessionDocument>,
    private agoraService: AgoraService,
    private ordersService: OrdersService, // ✅ ADD
    private walletService: WalletService, // ✅ ADD
    private recordingService: CallRecordingService, // ✅ ADD
  ) {}

  // ✅ UPDATED: Create session with order
  async createSession(sessionData: {
    userId: string;
    astrologerId: string;
    astrologerName: string;
    callType: 'audio' | 'video';
    ratePerMinute: number;
  }): Promise<any> {
    // Check wallet balance first
    const estimatedCost = sessionData.ratePerMinute; // At least 1 minute
    const hasBalance = await this.walletService.checkBalance(sessionData.userId, estimatedCost);
    
    if (!hasBalance) {
      throw new BadRequestException(
        `Insufficient balance. Minimum ₹${estimatedCost} required to start call.`
      );
    }

    const sessionId = `CALL_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    // ✅ Create order first
    const order = await this.ordersService.createOrder({
      userId: sessionData.userId,
      astrologerId: sessionData.astrologerId,
      astrologerName: sessionData.astrologerName,
      type: 'call',
      callType: sessionData.callType,
      ratePerMinute: sessionData.ratePerMinute,
      sessionId: sessionId
    });

    // Generate Agora credentials
    const channelName = this.agoraService.generateChannelName();
    const uid = this.agoraService.generateUid();
    const token = this.agoraService.generateRtcToken(channelName, uid, 'publisher', 3600);

    const session = new this.sessionModel({
      sessionId,
      userId: sessionData.userId,
      astrologerId: sessionData.astrologerId,
      orderId: order.orderId,
      callType: sessionData.callType,
      ratePerMinute: sessionData.ratePerMinute,
      status: 'initiated',
      agoraChannelName: channelName,
      agoraToken: token,
      agoraUid: uid,
      isRecorded: false,
      createdAt: new Date()
    });

    await session.save();

    this.logger.log(`Call session created: ${sessionId} | Type: ${sessionData.callType} | Order: ${order.orderId}`);

    return {
      sessionId: session.sessionId,
      orderId: order.orderId,
      channelName: session.agoraChannelName,
      token: session.agoraToken,
      uid: session.agoraUid,
      appId: this.agoraService.getAppId(),
      callType: session.callType,
      ratePerMinute: session.ratePerMinute
    };
  }

  // Update status
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
      
      // ✅ Start recording when call becomes active
      if (session.agoraChannelName && session.agoraUid) {
        try {
          await this.recordingService.startRecording(
            sessionId,
            session.agoraChannelName,
            session.agoraUid
          );
          this.logger.log(`Recording started for session: ${sessionId}`);
        } catch (error: any) {
          this.logger.error(`Failed to start recording: ${error.message}`);
          // Don't fail the call if recording fails
        }
      }

      // ✅ Update order status to ongoing
      await this.ordersService.updateOrderStatus(session.orderId, 'ongoing');
    }

    await session.save();
    return session;
  }

  // ✅ ENHANCED: End session with recording and billing
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

    // ✅ Stop recording if active
    let recordingUrl = '';
    let recordingS3Key = '';
    if (session.isRecorded && session.agoraResourceId && session.agoraSid) {
      try {
        const recordingResult = await this.recordingService.stopRecording(sessionId);
        recordingUrl = recordingResult.recordingUrl || '';
        recordingS3Key = recordingResult.recordingS3Key || '';
        
        this.logger.log(`Recording stopped for session: ${sessionId}`);
      } catch (error: any) {
        this.logger.error(`Failed to stop recording: ${error.message}`);
      }
    }

    // Calculate billing
    const billedMinutes = Math.ceil(duration / 60);
    const totalAmount = billedMinutes * session.ratePerMinute;
    const platformCommission = (totalAmount * 20) / 100; // 20% commission
    const astrologerEarning = totalAmount - platformCommission;

    // Update session
    session.status = 'ended';
    session.endTime = endTime;
    session.duration = duration;
    session.billedDuration = billedMinutes * 60;
    session.totalAmount = totalAmount;
    session.platformCommission = platformCommission;
    session.astrologerEarning = astrologerEarning;
    session.endedBy = endedBy;
    session.endReason = reason;

    if (recordingUrl) {
      session.recordingUrl = recordingUrl;
      session.recordingS3Key = recordingS3Key;
      session.recordingDuration = duration;
    }

    await session.save();

    // ✅ Complete order with recording details
    await this.ordersService.completeOrder(session.orderId, {
      duration,
      totalAmount,
      endTime,
      recordingUrl,
      recordingS3Key,
      recordingDuration: duration
    });

    // ✅ Process payment from wallet
    if (totalAmount > 0) {
      try {
        await this.walletService.deductFromWallet(
          session.userId.toString(),
          totalAmount,
          session.orderId,
          `${session.callType} call with astrologer - ${billedMinutes} min(s)`
        );

        session.isPaid = true;
        session.paidAt = new Date();
        await session.save();

        this.logger.log(`Payment processed: ${sessionId} | Amount: ₹${totalAmount}`);
      } catch (error: any) {
        this.logger.error(`Payment failed for session ${sessionId}: ${error.message}`);
        // Handle payment failure - maybe mark order for manual review
      }
    }

    this.logger.log(`Call ended: ${sessionId} | Duration: ${duration}s | Amount: ₹${totalAmount}`);

    return session;
  }

  // Get session details
  async getSession(sessionId: string): Promise<CallSessionDocument | null> {
    return this.sessionModel.findOne({ sessionId });
  }

  // Get active sessions
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

  // Regenerate token
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

  // ✅ NEW: Get call history with recordings
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
        .select('sessionId callType status duration totalAmount recordingUrl recordingType hasRecording createdAt endTime')
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

  // ✅ NEW: Get recording URL (voice note or video)
  async getRecording(sessionId: string, userId: string): Promise<any> {
    const session = await this.sessionModel.findOne({
      sessionId,
      $or: [{ userId }, { astrologerId: userId }]
    }).select('sessionId recordingUrl recordingDuration callType isRecorded');

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (!session.isRecorded || !session.recordingUrl) {
      throw new NotFoundException('Recording not available');
    }

    return {
      success: true,
      data: {
        sessionId: session.sessionId,
        recordingUrl: session.recordingUrl,
        recordingType: session.callType === 'audio' ? 'voice_note' : 'video',
        duration: session.recordingDuration,
        callType: session.callType
      }
    };
  }
}
