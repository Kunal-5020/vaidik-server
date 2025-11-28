// src/calls/services/call-session.service.ts

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CallSession, CallSessionDocument } from '../schemas/call-session.schema';
import { OrdersService } from '../../orders/services/orders.service';
import { OrderPaymentService } from '../../orders/services/order-payment.service';
import { WalletService } from '../../payments/services/wallet.service';
import { NotificationService } from '../../notifications/services/notification.service';
import { ChatMessageService } from '../../chat/services/chat-message.service';

@Injectable()
export class CallSessionService {
  private readonly logger = new Logger(CallSessionService.name);
  private sessionTimers = new Map<string, NodeJS.Timeout>();
  private joinTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(CallSession.name) private sessionModel: Model<CallSessionDocument>,
    private ordersService: OrdersService,
    private orderPaymentService: OrderPaymentService,
    private walletService: WalletService,
    private notificationService: NotificationService,
    private chatMessageService: ChatMessageService
  ) {}

  private generateSessionId(): string {
    return `CALL_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
  }

  private toObjectId(id: string): Types.ObjectId {
    try {
      return new Types.ObjectId(id);
    } catch {
      throw new BadRequestException('Invalid ID format');
    }
  }

  // ===== INITIATE CALL =====
  async initiateCall(sessionData: {
    userId: string;
    astrologerId: string;
    astrologerName: string;
    callType: 'audio' | 'video';
    ratePerMinute: number;
  }): Promise<any> {
    const estimatedCost = sessionData.ratePerMinute * 5;
    const hasBalance = await this.walletService.checkBalance(
      sessionData.userId,
      estimatedCost
    );

    if (!hasBalance) {
      throw new BadRequestException(
        `Insufficient balance. Minimum ₹${estimatedCost} required to start call.`
      );
    }

    const sessionId = this.generateSessionId();

    // STEP 1: Find or create conversation thread
    const conversationThread = await this.ordersService.findOrCreateConversationThread(
      sessionData.userId,
      sessionData.astrologerId,
      sessionData.astrologerName,
      sessionData.ratePerMinute
    );

    this.logger.log(`Using conversation thread: ${conversationThread.orderId}`);

    // STEP 2: Create order for this session
    const order = await this.ordersService.createOrder({
      userId: sessionData.userId,
      astrologerId: sessionData.astrologerId,
      astrologerName: sessionData.astrologerName,
      type: 'call',
      callType: sessionData.callType,
      ratePerMinute: sessionData.ratePerMinute,
      sessionId: sessionId
    });

    // STEP 3: Calculate session number
    const sessionNumber = order.sessionHistory.filter(s =>
      s.sessionType === 'audio_call' || s.sessionType === 'video_call'
    ).length + 1;

    // STEP 4: Create call session linked to conversation thread
    const session = new this.sessionModel({
      sessionId,
      userId: this.toObjectId(sessionData.userId),
      astrologerId: this.toObjectId(sessionData.astrologerId),
      orderId: order.orderId,
      conversationThreadId: order.conversationThreadId,
      sessionNumber,
      callType: sessionData.callType,
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
      },
      userStatus: {
        userId: this.toObjectId(sessionData.userId),
        isOnline: false,
        isMuted: false,
        isVideoOn: sessionData.callType === 'video',
        connectionQuality: 'offline'
      },
      astrologerStatus: {
        astrologerId: this.toObjectId(sessionData.astrologerId),
        isOnline: false,
        isMuted: false,
        isVideoOn: sessionData.callType === 'video',
        connectionQuality: 'offline'
      }
    });

    await session.save();

    // Set 3-min timeout
    this.setRequestTimeout(sessionId, order.orderId, sessionData.userId);

    const astroNotifType =
  sessionData.callType === 'video' ? 'call_request_video' : 'call_request_audio';

    // Notify astrologer (incoming call)
    this.notificationService
  .sendNotification({
    recipientId: sessionData.astrologerId,
    recipientModel: 'Astrologer',
    type: astroNotifType, // astrologer app has call_request_audio / call_request_video
    title: 'Incoming call request',
    message: `You have a new ${
      sessionData.callType === 'video' ? 'video' : 'audio'
    } call request.`,
    data: {
      type: astroNotifType,                 // so apps can read data.type directly
      mode: 'call',
      callType: sessionData.callType,       // 'audio' | 'video'
      sessionId,
      orderId: order.orderId,
      conversationThreadId: order.conversationThreadId,
      userId: sessionData.userId,
      astrologerId: sessionData.astrologerId,
      ratePerMinute: sessionData.ratePerMinute,
      sessionNumber,
      step: 'user_initiated',
      fullScreen: 'true',
    },
    priority: 'urgent',
  })
  .catch(err =>
    this.logger.error(`Call incoming notification error: ${err.message}`),
  );

    return {
      success: true,
      message: 'Call initiated - waiting for astrologer',
      data: {
        sessionId: session.sessionId,
        orderId: order.orderId,
        conversationThreadId: order.conversationThreadId,
        sessionNumber,
        status: 'initiated',
        callType: sessionData.callType,
        ratePerMinute: sessionData.ratePerMinute
      }
    };
  }

  // ===== ACCEPT CALL =====
  async acceptCall(sessionId: string, astrologerId: string): Promise<any> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== 'initiated') {
      throw new BadRequestException('Call not in initiated state');
    }

    if (this.sessionTimers.has(sessionId)) {
      clearTimeout(this.sessionTimers.get(sessionId)!);
      this.sessionTimers.delete(sessionId);
    }

    session.status = 'waiting';
    session.acceptedAt = new Date();
    await session.save();

    // Start 60s join timeout for user
    this.setUserJoinTimeout(sessionId);

    // Notify user that astrologer accepted call – aligned with user app
const userNotifType =
  session.callType === 'video' ? 'call_video' : 'call_audio';

this.notificationService
  .sendNotification({
    recipientId: session.userId.toString(),
    recipientModel: 'User',
    type: userNotifType, // user app has call_video / call_audio in getNotificationConfig
    title: 'Astrologer is ready',
    message: 'Tap to join your call now.',
    data: {
      type: userNotifType,
      mode: 'call',
      callType: session.callType,
      sessionId: session.sessionId,
      orderId: session.orderId,
      astrologerId,
      ratePerMinute: session.ratePerMinute,
      step: 'astrologer_accepted',
      fullScreen: 'true',
    },
    priority: 'urgent',
  })
  .catch(err =>
    this.logger.error(`Call accepted notification error: ${err.message}`),
  );

    this.logger.log(`Call accepted: ${sessionId}`);

    return {
      success: true,
      message: 'Call accepted',
      status: 'waiting'
    };
  }

  // ===== REJECT CALL =====
  async rejectCall(
    sessionId: string,
    astrologerId: string,
    reason: string
  ): Promise<any> {
    const session = await this.sessionModel.findOne({ sessionId });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.status !== 'initiated' && session.status !== 'waiting') {
      throw new BadRequestException('Call cannot be rejected at this stage');
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

    // Update order (no wallet logic here)
    await this.ordersService.cancelOrder(
      session.orderId,
      session.userId.toString(),
      reason,
      'astrologer'
    );

    // Notify user that call was rejected – use request_rejected, not call_ended
const notifType = 'request_rejected';

this.notificationService
  .sendNotification({
    recipientId: session.userId.toString(),
    recipientModel: 'User',
    type: notifType, // user app has request_rejected in getNotificationConfig
    title: 'Call request rejected',
    message: 'Astrologer rejected your call request. No amount has been charged.',
    data: {
      type: notifType,
      mode: 'call',
      callType: session.callType,
      sessionId: session.sessionId,
      orderId: session.orderId,
      astrologerId,
      step: 'astrologer_rejected',
    },
    priority: 'medium',
  })
  .catch(err =>
    this.logger.error(`Call rejected notification error: ${err.message}`),
  );

    this.logger.log(`Call rejected: ${sessionId}`);

    return {
      success: true,
      message: 'Call rejected'
    };
  }

  // ===== START CALL SESSION =====
  async startSession(sessionId: string): Promise<any> {
  const session = await this.getSession(sessionId);
  if (!session) {
    // This is the error you're seeing in gateway
    throw new NotFoundException('Session not found');
  }

  if (session.status !== 'waiting' && session.status !== 'waiting_in_queue') {
    throw new BadRequestException(
      `Session not in valid state to start: ${session.status}`,
    );
  }

  const walletBalance = await this.walletService.getBalance(
    session.userId.toString(),
  );
  const maxDurationMinutes = Math.floor(walletBalance / session.ratePerMinute);
  const maxDurationSeconds = maxDurationMinutes * 60;

  if (maxDurationMinutes < 1) {
    throw new BadRequestException('Insufficient balance to start call');
  }

  session.status = 'active';
  session.startTime = new Date();
  session.maxDurationMinutes = maxDurationMinutes;
  session.maxDurationSeconds = maxDurationSeconds;
  session.timerStatus = 'running';
  session.timerMetrics.elapsedSeconds = 0;
  session.timerMetrics.remainingSeconds = maxDurationSeconds;
  session.timerMetrics.lastUpdatedAt = new Date();

  if (session.userStatus) {
    session.userStatus.isOnline = true;
    session.userStatus.connectionQuality = 'good';
  }
  if (session.astrologerStatus) {
    session.astrologerStatus.isOnline = true;
    session.astrologerStatus.connectionQuality = 'good';
  }

  await session.save();
  this.clearUserJoinTimeout(sessionId);
  await this.ordersService.updateOrderStatus(session.orderId, 'active');
  this.setAutoEndTimer(sessionId, maxDurationSeconds);

  this.logger.log(
    `Call session started: ${sessionId} | Type: ${session.callType} | Max Duration: ${maxDurationMinutes} mins`,
  );

  return {
    success: true,
    message: 'Call session started',
    data: {
      status: 'active',
      maxDurationMinutes,
      maxDurationSeconds,
      ratePerMinute: session.ratePerMinute,
      callType: session.callType,
    },
  };
}

  // ===== CREATE CHAT MESSAGE FOR CALL RECORDING =====
  private async createRecordingChatMessage(
    sessionId: string,
    orderId: string,
    conversationThreadId: string,
    userId: string,
    astrologerId: string,
    callType: 'audio' | 'video',
    recordingUrl: string,
    recordingS3Key: string,
    recordingDuration: number,
    actualDurationSeconds: number
  ): Promise<string> {
    try {
      const mins = Math.floor(actualDurationSeconds / 60);
      const secs = actualDurationSeconds % 60;
      const durationText = `${mins}:${String(secs).padStart(2, '0')}`;

      const messageType = callType === 'video' ? 'video' : 'voice_note';
      const content = callType === 'video'
        ? `📹 Video Call Recording - ${durationText}`
        : `🎤 Voice Call Recording - ${durationText}`;

      const message = await this.chatMessageService.sendMessage({
        sessionId: sessionId,
        orderId: orderId,
        senderId: userId,
        senderModel: 'System' as any,
        receiverId: astrologerId,
        receiverModel: 'Astrologer',
        type: messageType,
        content,
        fileUrl: recordingUrl,
        fileS3Key: recordingS3Key,
        fileDuration: recordingDuration,
        isCallRecording: true,
        linkedSessionId: sessionId,
      });

      this.logger.log(`Recording message created: ${message.messageId} for call ${sessionId}`);

      return message.messageId;
    } catch (error: any) {
      this.logger.error(`Failed to create recording message: ${error.message}`);
      throw error;
    }
  }

  // ===== END CALL SESSION =====
  async endSession(
    sessionId: string,
    endedBy: string,
    reason: string,
    recordingUrl?: string,
    recordingS3Key?: string,
    recordingDuration?: number
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
    this.clearUserJoinTimeout(sessionId);

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

      this.logger.log(
        `Call billing prepared: ${sessionId} | Actual: ${actualDurationSeconds}s | Billed: ${session.billedMinutes}m | Amount: ₹${session.totalAmount}`
      );
    }

    // WALLET DEDUCTION (only if call had actual duration)
    if (actualDurationSeconds > 0 && session.totalAmount > 0) {
      try {
        const description = `Call (${session.callType}) with astrologer ${session.astrologerId.toString()} (session ${sessionId})`;
        await this.walletService.deductFromWallet(
          session.userId.toString(),
          session.totalAmount,
          session.orderId,
          description,
        );
        this.logger.log(
          `💰 Wallet charged for call: User=${session.userId} | Order=${session.orderId} | Amount=₹${session.totalAmount}`,
        );
      } catch (error: any) {
        this.logger.error(
          `❌ Wallet deduction failed for call session ${sessionId}: ${error.message}`,
        );
        session.isPaid = false;
      }
    }

    session.status = 'ended';
    session.endTime = new Date();
    session.endedBy = endedBy;
    session.endReason = reason;
    session.timerStatus = 'ended';

    // Add recording if available
    if (recordingUrl && actualDurationSeconds > 0) {
      session.hasRecording = true;
      session.recordingUrl = recordingUrl;
      session.recordingS3Key = recordingS3Key;
      session.recordingDuration = recordingDuration || actualDurationSeconds;
      session.recordingType = session.callType === 'audio' ? 'voice_note' : 'video';
      session.recordingStartedAt = session.startTime;
      session.recordingEndedAt = new Date();

      try {
        const recordingMessageId = await this.createRecordingChatMessage(
          sessionId,
          session.orderId,
          session.conversationThreadId!,
          session.userId.toString(),
          session.astrologerId.toString(),
          session.callType as 'audio' | 'video',
          recordingUrl,
          recordingS3Key || '',
          session.recordingDuration,
          actualDurationSeconds
        );

        session.recordingMessageId = recordingMessageId;
        this.logger.log(`✅ Recording saved to chat: ${recordingMessageId}`);
      } catch (error: any) {
        this.logger.error(`Failed to save recording to chat: ${error.message}`);
      }
    }

    // Update participant status
    if (session.userStatus) {
      session.userStatus.isOnline = false;
      session.userStatus.connectionQuality = 'offline';
    }
    if (session.astrologerStatus) {
      session.astrologerStatus.isOnline = false;
      session.astrologerStatus.connectionQuality = 'offline';
    }

    await session.save();

    // Complete session in orders
    await this.ordersService.completeSession(session.orderId, {
      sessionId,
      sessionType: session.callType === 'audio' ? 'audio_call' : 'video_call',
      actualDurationSeconds,
      billedMinutes: session.billedMinutes,
      chargedAmount: session.totalAmount,
      recordingUrl,
      recordingS3Key,
      recordingDuration: session.recordingDuration
    });

    // Optional: notify user with call summary if there was real duration
    if (actualDurationSeconds > 0 && session.totalAmount > 0) {
      try {
        await this.notificationService.sendNotification({
          recipientId: session.userId.toString(),
          recipientModel: 'User',
          type: 'call_ended',
          title: 'Call ended',
          message: `Your call session ended. Duration: ${session.billedMinutes} min, Charged: ₹${session.totalAmount}.`,
          data: {
            mode: 'call',
            step: 'session_ended',
            sessionId: session.sessionId,
            orderId: session.orderId,
            callType: session.callType,
            billedMinutes: session.billedMinutes,
            amount: session.totalAmount,
            recordingUrl: session.recordingUrl,
          },
          priority: 'medium',
        });
      } catch (err: any) {
        this.logger.error(`Call end notification error: ${err.message}`);
      }
    }

    this.logger.log(
      `Call session ended: ${sessionId} | Duration: ${actualDurationSeconds}s | Type: ${session.callType}`,
    );

    return {
      success: true,
      message: 'Call session ended',
      data: {
        sessionId,
        actualDuration: actualDurationSeconds,
        billedMinutes: session.billedMinutes,
        chargeAmount: session.totalAmount,
        recordingUrl: recordingUrl,
        recordingMessageId: session.recordingMessageId,
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

        session.status = 'cancelled';
        session.endReason = 'astrologer_no_response';
        session.endTime = new Date();
        await session.save();

        // Update order (sends timeout notification with "no charge" wording)
        await this.ordersService.handleOrderTimeout(orderId);

        this.logger.log(`Call request timeout: ${sessionId}`);
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

  // ===== USER JOIN TIMEOUT (60 sec after astrologer accepts call) =====
  private setUserJoinTimeout(sessionId: string) {
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

        if (session.status === 'waiting' || session.status === 'waiting_in_queue') {
          this.logger.warn(`User did not join call within 60s for session ${sessionId}`);

          // No deduction; endSession handles 0-duration correctly
          await this.endSession(sessionId, 'system', 'user_no_show');
        }

        this.joinTimers.delete(sessionId);
      } catch (error: any) {
        this.logger.error(`Call user-join timeout error for ${sessionId}: ${error.message}`);
      }
    }, 60 * 1000);

    this.joinTimers.set(sessionId, timeout);
  }

  private clearUserJoinTimeout(sessionId: string) {
    if (this.joinTimers.has(sessionId)) {
      clearTimeout(this.joinTimers.get(sessionId)!);
      this.joinTimers.delete(sessionId);
    }
  }

  // ===== GET SESSION =====
 async getSession(sessionId: string): Promise<CallSessionDocument | null> {
  const session = await this.sessionModel.findOne({ sessionId }).exec();
  if (!session) {
    this.logger.warn(`getSession: No session found for id=${sessionId}`);
  }
  return session;
}

  // ===== GET ACTIVE SESSIONS =====
  async getUserActiveSessions(userId: string): Promise<CallSessionDocument[]> {
    return this.sessionModel
      .find({
        userId: this.toObjectId(userId),
        status: { $in: ['initiated', 'waiting', 'waiting_in_queue', 'active'] }
      })
      .populate('astrologerId', 'name profilePicture isOnline')
      .sort({ createdAt: -1 });
  }

  // ===== GET CALL HISTORY =====
  async getCallHistory(
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

  // ===== UPDATE PARTICIPANT STATUS =====
  async updateParticipantStatus(
    sessionId: string,
    userId: string,
    role: 'user' | 'astrologer',
    statusUpdate: {
      isOnline?: boolean;
      isMuted?: boolean;
      isVideoOn?: boolean;
      connectionQuality?: string;
    }
  ): Promise<void> {
    const updateField = role === 'user' ? 'userStatus' : 'astrologerStatus';

    const updateObj: any = {};
    if (statusUpdate.isOnline !== undefined) {
      updateObj[`${updateField}.isOnline`] = statusUpdate.isOnline;
    }
    if (statusUpdate.isMuted !== undefined) {
      updateObj[`${updateField}.isMuted`] = statusUpdate.isMuted;
    }
    if (statusUpdate.isVideoOn !== undefined) {
      updateObj[`${updateField}.isVideoOn`] = statusUpdate.isVideoOn;
    }
    if (statusUpdate.connectionQuality) {
      updateObj[`${updateField}.connectionQuality`] = statusUpdate.connectionQuality;
    }

    await this.sessionModel.findOneAndUpdate(
      { sessionId },
      { $set: updateObj }
    );
  }

  // ===== CONTINUE CALL =====
  async continueCall(
    sessionId: string,
    userId: string
  ): Promise<any> {
    const session = await this.sessionModel.findOne({
      sessionId,
      userId: this.toObjectId(userId),
      isActive: true
    });

    if (!session) {
      throw new NotFoundException('Call not found or not available for continuation');
    }

    // Recalculate max duration based on current wallet
    const walletBalance = await this.walletService.getBalance(userId);
    const maxDurationMinutes = Math.floor(walletBalance / session.ratePerMinute);

    if (maxDurationMinutes < 5) {
      throw new BadRequestException(
        `Insufficient balance. Need at least ₹${session.ratePerMinute * 5} to continue.`
      );
    }

    // Update session for continuation
    session.maxDurationMinutes = maxDurationMinutes;
    session.status = 'waiting';

    await session.save();

    this.logger.log(`Call continued: ${sessionId} | New max duration: ${maxDurationMinutes} mins`);

    return {
      success: true,
      message: 'Call ready to continue',
      sessionId,
      maxDurationMinutes,
      previousSessions: session.sessionHistory.length,
      totalPreviouslySpent: session.totalAmount,
      callType: session.callType
    };
  }

  // ===== CANCEL CALL =====
  async cancelCall(
    sessionId: string,
    userId: string,
    reason: string,
    cancelledBy: 'user' | 'astrologer' | 'system' | 'admin'
  ): Promise<any> {
    const session = await this.sessionModel.findOne({
      sessionId,
      userId: this.toObjectId(userId),
      status: { $in: ['initiated', 'waiting', 'waiting_in_queue'] }
    });

    if (!session) {
      throw new NotFoundException('Call not found or cannot be cancelled at this stage');
    }

    session.status = 'cancelled';
    session.endReason = reason;
    session.endedBy = cancelledBy;
    session.endTime = new Date();

    await session.save();

    this.logger.log(`Call cancelled: ${sessionId}`);

    return {
      success: true,
      message: 'Call cancelled successfully'
    };
  }
}
