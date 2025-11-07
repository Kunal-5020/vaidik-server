// src/calls/services/call-session.service.ts

import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CallSession, CallSessionDocument } from '../schemas/call-session.schema';
import { OrdersService } from '../../orders/services/orders.service';
import { OrderPaymentService } from '../../orders/services/order-payment.service';
import { WalletService } from '../../payments/services/wallet.service';

@Injectable()
export class CallSessionService {
  private readonly logger = new Logger(CallSessionService.name);
  private sessionTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectModel(CallSession.name) private sessionModel: Model<CallSessionDocument>,
    private ordersService: OrdersService,
    private orderPaymentService: OrderPaymentService,
    private walletService: WalletService
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

    // Create order with HOLD payment
    const order = await this.ordersService.createOrder({
      userId: sessionData.userId,
      astrologerId: sessionData.astrologerId,
      astrologerName: sessionData.astrologerName,
      type: 'call',
      callType: sessionData.callType,
      ratePerMinute: sessionData.ratePerMinute,
      sessionId: sessionId
    });

    // Create call session (INITIATED)
    const session = new this.sessionModel({
      sessionId,
      userId: this.toObjectId(sessionData.userId),
      astrologerId: this.toObjectId(sessionData.astrologerId),
      orderId: order.orderId,
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

    this.logger.log(`Call initiated: ${sessionId} | Order: ${order.orderId} | Type: ${sessionData.callType}`);

    return {
      success: true,
      message: 'Call initiated - waiting for astrologer',
      data: {
        sessionId: session.sessionId,
        orderId: order.orderId,
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

    this.logger.log(`Call rejected: ${sessionId}`);

    return {
      success: true,
      message: 'Call rejected and refunded'
    };
  }

  // ===== START CALL SESSION =====
  async startSession(sessionId: string): Promise<any> {
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
      throw new BadRequestException('Insufficient balance to start call');
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

    // Update participant status
    if (session.userStatus) {
      session.userStatus.isOnline = true;
      session.userStatus.connectionQuality = 'good';
    }
    if (session.astrologerStatus) {
      session.astrologerStatus.isOnline = true;
      session.astrologerStatus.connectionQuality = 'good';
    }

    await session.save();

    // Update order status
    await this.ordersService.updateOrderStatus(session.orderId, 'active');

    // Start auto-end timer
    this.setAutoEndTimer(sessionId, maxDurationSeconds);

    this.logger.log(
      `Call session started: ${sessionId} | Type: ${session.callType} | Max Duration: ${maxDurationMinutes} mins`
    );

    return {
      success: true,
      message: 'Call session started',
      data: {
        status: 'active',
        maxDurationMinutes,
        maxDurationSeconds,
        ratePerMinute: session.ratePerMinute,
        callType: session.callType
      }
    };
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
          `Call charged: ${sessionId} | Actual: ${actualDurationSeconds}s | Billed: ${session.billedMinutes}m | Amount: ₹${session.totalAmount}`
        );
      } catch (error: any) {
        this.logger.error(`Payment failed for call ${sessionId}: ${error.message}`);
        throw error;
      }
    }

    session.status = 'ended';
    session.endTime = new Date();
    session.endedBy = endedBy;
    session.endReason = reason;
    session.timerStatus = 'ended';

    // Add recording if available
    if (recordingUrl) {
      session.hasRecording = true;
      session.recordingUrl = recordingUrl;
      session.recordingS3Key = recordingS3Key;
      session.recordingDuration = recordingDuration;
      session.recordingType = session.callType === 'audio' ? 'voice_note' : 'video';
      session.recordingStartedAt = session.startTime;
      session.recordingEndedAt = new Date();
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
      recordingUrl,
      recordingS3Key,
      recordingDuration
    });

    this.logger.log(`Call session ended: ${sessionId} | Duration: ${actualDurationSeconds}s | Type: ${session.callType}`);

    return {
      success: true,
      message: 'Call session ended',
      data: {
        sessionId,
        actualDuration: actualDurationSeconds,
        billedMinutes: session.billedMinutes,
        chargeAmount: session.totalAmount,
        recordingUrl: recordingUrl,
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

  // ===== GET SESSION =====
  async getSession(sessionId: string): Promise<CallSessionDocument | null> {
    return this.sessionModel.findOne({ sessionId });
  }

  // ===== GET ACTIVE SESSIONS =====
  async getUserActiveSessions(userId: string): Promise<CallSessionDocument[]> {
    return this.sessionModel
      .find({
        userId: this.toObjectId(userId),
        status: { $in: ['initiated', 'waiting', 'waiting_in_queue', 'active'] }
      })
      .populate('astrologerId', 'name profilePicture isOnline')
      .sort({ createdAt: -1 })
      .lean();
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
    const maxDurationInfo = await this.orderPaymentService.calculateMaxDuration(
      userId,
      session.ratePerMinute
    );

    if (maxDurationInfo.maxDurationMinutes < 5) {
      throw new BadRequestException(
        `Insufficient balance. Need at least ₹${session.ratePerMinute * 5} to continue.`
      );
    }

    // HOLD new payment for continuation
    await this.orderPaymentService.holdPayment(
      session.orderId,
      userId,
      session.ratePerMinute,
      maxDurationInfo.maxDurationMinutes
    );

    // Update session for continuation
    session.maxDurationMinutes = maxDurationInfo.maxDurationMinutes;
    session.status = 'waiting';

    await session.save();

    this.logger.log(`Call continued: ${sessionId} | New max duration: ${maxDurationInfo.maxDurationMinutes} mins`);

    return {
      success: true,
      message: 'Call ready to continue',
      sessionId,
      maxDurationMinutes: maxDurationInfo.maxDurationMinutes,
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

    // Refund hold if payment is still on hold
    if (await this.orderPaymentService.hasHold(session.orderId)) {
      try {
        await this.orderPaymentService.refundHold(
          session.orderId,
          userId,
          `Cancellation: ${reason}`
        );
      } catch (error) {
        this.logger.warn(`Could not refund hold: ${error}`);
      }
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
