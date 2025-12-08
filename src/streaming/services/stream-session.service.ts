// src/streaming/services/stream-session.service.ts

import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StreamSession, StreamSessionDocument } from '../schemas/stream-session.schema';
import { StreamViewer, StreamViewerDocument } from '../schemas/stream-viewer.schema';
import { CallTransaction, CallTransactionDocument } from '../schemas/call-transaction.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { StreamAgoraService } from './stream-agora.service';
import { UpdateCallSettingsDto } from '../dto/update-call-settings.dto';
import { UpdateStreamDto } from '../dto/update-stream.dto';
import { StreamGateway } from '../gateways/streaming.gateway';
import { StreamRecordingService } from './stream-recording.service';
import { WalletService } from '../../payments/services/wallet.service';
import { EarningsService } from '../../astrologers/services/earnings.service';

@Injectable()
export class StreamSessionService {
  private readonly logger = new Logger(StreamSessionService.name);

  constructor(
    @InjectModel(StreamSession.name) private streamModel: Model<StreamSessionDocument>,
    @InjectModel(StreamViewer.name) private viewerModel: Model<StreamViewerDocument>,
    @InjectModel(CallTransaction.name) private callTransactionModel: Model<CallTransactionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private readonly streamRecordingService: StreamRecordingService,
    private streamAgoraService: StreamAgoraService,
    private walletService: WalletService,
    private earningsService: EarningsService,
    @Inject(forwardRef(() => StreamGateway)) private streamGateway: StreamGateway,
  ) {}

  // ==================== STREAM MANAGEMENT ====================

  /**
   * Create stream
   */
  async createStream(streamData: {
    hostId: string;
    title: string;
    description?: string;
    streamType: 'free' | 'paid';
    entryFee?: number;
    scheduledAt?: Date;
    thumbnailUrl?: string;
  }): Promise<any> {
    const streamId = `STREAM_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    const channelName = this.streamAgoraService.generateChannelName();
    const hostUid = this.streamAgoraService.generateUid();
    const token = this.streamAgoraService.generateBroadcasterToken(channelName, hostUid);

    const stream = new this.streamModel({
      streamId,
      hostId: streamData.hostId,
      title: streamData.title,
      description: streamData.description,
      streamType: streamData.streamType,
      entryFee: streamData.entryFee || 0,
      scheduledAt: streamData.scheduledAt,
      thumbnailUrl: streamData.thumbnailUrl,
      status: 'scheduled',
      agoraChannelName: channelName,
      agoraToken: token,
      hostAgoraUid: hostUid,
      currentState: 'idle',
      isMicEnabled: true,
      isCameraEnabled: true,
      callSettings: {
        isCallEnabled: true,
        voiceCallPrice: 50,
        videoCallPrice: 100,
        allowPublicCalls: true,
        allowPrivateCalls: true,
        maxCallDuration: 600,
      },
      callWaitlist: [],
      createdAt: new Date()
    });

    await stream.save();

    return {
      success: true,
      message: 'Stream created successfully',
      data: {
        streamId: stream.streamId,
        channelName: stream.agoraChannelName,
        token: stream.agoraToken,
        uid: stream.hostAgoraUid,
        appId: this.streamAgoraService.getAppId()
      }
    };
  }

  /**
   * Get streams by host
   */
  async getStreamsByHost(hostId: string, filters: { status?: string; page: number; limit: number }): Promise<any> {
    const query: any = { hostId };
    if (filters.status) query.status = filters.status;

    const skip = (filters.page - 1) * filters.limit;

    const [streams, total] = await Promise.all([
      this.streamModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .lean(),
      this.streamModel.countDocuments(query)
    ]);

    return {
      success: true,
      data: {
        streams,
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
   * ✅ Start stream (go live)
   */
  async startStream(streamId: string, hostId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId, hostId });
    
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status === 'live') {
      this.logger.warn(`⚠️ Stream ${streamId} is already live`);
      return {
        success: true,
        message: 'Stream is already live',
        data: stream,
      };
    }

    if (stream.status === 'ended') {
      throw new BadRequestException('Stream has already ended and cannot be restarted');
    }

    if (stream.status === 'cancelled') {
      throw new BadRequestException('Stream has been cancelled');
    }

    // ✅ Mark astrologer as busy
    await this.astrologerModel.findByIdAndUpdate(hostId, {
      'availability.isOnline': true,
      'availability.isAvailable': false,
      'availability.isLive': true,
      'availability.liveStreamId': streamId,
      'availability.busyUntil': new Date(Date.now() + 4 * 60 * 60 * 1000),
      'availability.lastActive': new Date()
    });

    stream.status = 'live';
    stream.currentState = 'streaming';
    stream.startedAt = new Date();
    await stream.save();

    this.logger.log(`✅ Stream ${streamId} started. Astrologer marked as busy.`);

    // Auto-end after 4 hours
    setTimeout(async () => {
      try {
        const stream = await this.streamModel.findOne({ streamId });
        if (stream && stream.status === 'live') {
          await this.endStream(streamId, hostId);
        }
      } catch (error) {
        console.error('Error in stream timeout:', error);
      }
    }, 4 * 60 * 60 * 1000);

    return {
      success: true,
      message: 'Stream is now live',
      data: stream,
    };
  }

  /**
   * ✅ End stream
   */
  async endStream(streamId: string, hostId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId, hostId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status === 'ended') {
      this.logger.warn(`⚠️ Stream ${streamId} already ended`);
      return {
        success: true,
        message: 'Stream already ended',
        data: {
          streamId: stream.streamId,
          duration: stream.duration,
          totalViews: stream.totalViews,
          peakViewers: stream.peakViewers,
          totalRevenue: stream.totalRevenue,
          totalCalls: stream.totalCalls
        }
      };
    }

    if (stream.status !== 'live') {
      throw new BadRequestException('Stream is not live');
    }

    // End current call if any
    if (stream.currentCall?.isOnCall) {
      await this.endCurrentCall(streamId, hostId);
    }

    const endTime = new Date();
    const duration = stream.startedAt 
      ? Math.floor((endTime.getTime() - stream.startedAt.getTime()) / 1000)
      : 0;

    stream.status = 'ended';
    stream.endedAt = endTime;
    stream.duration = duration;
    stream.currentState = 'idle';
    stream.isRecording = false;

    await this.viewerModel.updateMany(
      { streamId, isActive: true },
      { 
        $set: { 
          isActive: false,
          leftAt: endTime
        }
      }
    );

    stream.callWaitlist = stream.callWaitlist.map(req => ({
      ...req,
      status: 'expired'
    }));

    await stream.save();

    // ✅ Mark astrologer as available
    await this.astrologerModel.findByIdAndUpdate(hostId, {
      'availability.isAvailable': true,
      'availability.isLive': false,
      'availability.liveStreamId': null,
      'availability.busyUntil': null,
      'availability.lastActive': new Date()
    });

    this.logger.log(`✅ Stream ${streamId} ended. Astrologer available.`);

    return {
      success: true,
      message: 'Stream ended',
      data: {
        streamId: stream.streamId,
        duration: stream.duration,
        totalViews: stream.totalViews,
        peakViewers: stream.peakViewers,
        totalRevenue: stream.totalRevenue,
        totalCalls: stream.totalCalls
      }
    };
  }

  /**
   * Update stream
   */
  async updateStream(streamId: string, hostId: string, updateDto: UpdateStreamDto): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId, hostId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status === 'ended') {
      throw new BadRequestException('Cannot update ended stream');
    }

    if (updateDto.title) stream.title = updateDto.title;
    if (updateDto.description !== undefined) stream.description = updateDto.description;
    if (updateDto.thumbnailUrl) stream.thumbnailUrl = updateDto.thumbnailUrl;
    if (updateDto.allowComments !== undefined) stream.allowComments = updateDto.allowComments;
    if (updateDto.allowGifts !== undefined) stream.allowGifts = updateDto.allowGifts;

    await stream.save();

    return {
      success: true,
      message: 'Stream updated successfully',
      data: stream
    };
  }

  /**
   * ✅ Delete stream - FIXED
   */
  async deleteStream(streamId: string, hostId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId, hostId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status === 'live') {
      throw new BadRequestException('Cannot delete a live stream. Please end it first.');
    }

    if (stream.status === 'ended') {
      throw new BadRequestException('Cannot delete ended streams');
    }

    if (stream.status !== 'scheduled') {
      throw new BadRequestException('Can only delete scheduled streams');
    }

    await this.streamModel.deleteOne({ streamId, hostId });

    this.logger.log(`✅ Stream ${streamId} deleted`);

    return {
      success: true,
      message: 'Stream deleted successfully'
    };
  }

  // ==================== STREAM CONTROLS ====================

  async toggleMic(streamId: string, enabled: boolean): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    stream.isMicEnabled = enabled;
    await stream.save();

    return {
      success: true,
      message: `Microphone ${enabled ? 'enabled' : 'disabled'}`,
      data: { isMicEnabled: enabled }
    };
  }

  async toggleCamera(streamId: string, enabled: boolean): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    stream.isCameraEnabled = enabled;
    await stream.save();

    return {
      success: true,
      message: `Camera ${enabled ? 'enabled' : 'disabled'}`,
      data: { isCameraEnabled: enabled }
    };
  }

  // ==================== CALL MANAGEMENT ====================

  async updateCallSettings(streamId: string, settings: UpdateCallSettingsDto): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (settings.isCallEnabled !== undefined) {
      stream.callSettings.isCallEnabled = settings.isCallEnabled;
    }
    if (settings.voiceCallPrice !== undefined) {
      stream.callSettings.voiceCallPrice = settings.voiceCallPrice;
    }
    if (settings.videoCallPrice !== undefined) {
      stream.callSettings.videoCallPrice = settings.videoCallPrice;
    }
    if (settings.allowPublicCalls !== undefined) {
      stream.callSettings.allowPublicCalls = settings.allowPublicCalls;
    }
    if (settings.allowPrivateCalls !== undefined) {
      stream.callSettings.allowPrivateCalls = settings.allowPrivateCalls;
    }
    if (settings.maxCallDuration !== undefined) {
      stream.callSettings.maxCallDuration = settings.maxCallDuration;
    }

    await stream.save();

    return {
      success: true,
      message: 'Call settings updated successfully',
      data: stream.callSettings
    };
  }

  /**
   * ✅ Request call - WITH BALANCE VALIDATION (NO HOLD)
   */
  async requestCall(
    streamId: string,
    userId: string,
    callType: 'voice' | 'video',
    callMode: 'public' | 'private'
  ): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId, status: 'live' });
    if (!stream) {
      throw new NotFoundException('Stream not found or not live');
    }

    if (!stream.callSettings.isCallEnabled) {
      throw new BadRequestException('Calls are not enabled for this stream');
    }

    if (callMode === 'public' && !stream.callSettings.allowPublicCalls) {
      throw new BadRequestException('Public calls are not allowed');
    }

    if (callMode === 'private' && !stream.callSettings.allowPrivateCalls) {
      throw new BadRequestException('Private calls are not allowed');
    }

    // ✅ Check if user is currently on call
    if (stream.currentCall?.isOnCall && stream.currentCall.callerId.toString() === userId) {
      throw new BadRequestException('You are already on a call');
    }

    // ✅ Check if user already in waitlist
    const existingRequest = stream.callWaitlist.find(
      req => req.userId.toString() === userId && req.status === 'waiting'
    );

    if (existingRequest) {
      throw new BadRequestException('You already have a pending call request');
    }

    // Get user details
    const user: any = await this.userModel
      .findById(userId)
      .select('name profileImage profilePicture wallet')
      .lean();
    
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // ✅ Calculate max call cost
    const pricePerMinute = callType === 'video' 
      ? stream.callSettings.videoCallPrice 
      : stream.callSettings.voiceCallPrice;

    const maxCallMinutes = Math.ceil(stream.callSettings.maxCallDuration / 60);
    const maxCallCost = pricePerMinute * maxCallMinutes;

    // ✅ Validate balance (but DON'T deduct yet)
    if (!user.wallet || user.wallet.balance < maxCallCost) {
      throw new BadRequestException(
        `Insufficient balance. Maximum call cost: ₹${maxCallCost} (${maxCallMinutes} min × ₹${pricePerMinute}/min). Your balance: ₹${user.wallet?.balance || 0}`
      );
    }

    // Add to waitlist
    const position = stream.callWaitlist.filter(req => req.status === 'waiting').length + 1;

    stream.callWaitlist.push({
      userId: new Types.ObjectId(userId),
      userName: user.name || 'Anonymous',
      userAvatar: user.profileImage || user.profilePicture || null,
      callType,
      callMode,
      requestedAt: new Date(),
      position,
      status: 'waiting'
    });

    await stream.save();

    this.logger.log(`📞 Call requested: ${user.name} (${callType}) - Balance verified for max ${maxCallMinutes} min`);

    // Emit socket event
    try {
      this.streamGateway.notifyCallRequest(streamId, {
        userId,
        userName: user.name || 'Anonymous',
        userAvatar: user.profileImage || user.profilePicture || null,
        callType,
        callMode,
        position,
      });
    } catch (error) {
      this.logger.error('❌ Socket event failed:', error);
    }

    return {
      success: true,
      message: 'Call request sent successfully',
      data: {
        position,
        waitingCount: stream.callWaitlist.filter(req => req.status === 'waiting').length,
        estimatedWaitTime: position * 600,
        callType,
        pricePerMinute,
        maxCallCost,
        maxCallMinutes
      }
    };
  }

  /**
   * ✅ Accept call request - NO HOLD, JUST VALIDATION
   */
  async acceptCallRequest(streamId: string, userId: string, hostId: string): Promise<any> {
    try {
      console.log('✅ ACCEPTING CALL REQUEST');
      console.log('Stream ID:', streamId);
      console.log('User ID:', userId);

      const stream = await this.streamModel.findOne({ streamId, hostId });
      if (!stream) {
        throw new NotFoundException('Stream not found');
      }

      if (stream.currentCall?.isOnCall) {
        throw new BadRequestException('Already on a call');
      }

      const requestIndex = stream.callWaitlist.findIndex(
        req => req.userId.toString() === userId && req.status === 'waiting'
      );

      if (requestIndex === -1) {
        throw new BadRequestException('Call request not found');
      }

      const request = stream.callWaitlist[requestIndex];

      // ✅ Re-validate balance before accepting
      const user: any = await this.userModel.findById(userId).select('name wallet').lean();
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const pricePerMinute = request.callType === 'video' 
        ? stream.callSettings.videoCallPrice 
        : stream.callSettings.voiceCallPrice;

      const maxCallMinutes = Math.ceil(stream.callSettings.maxCallDuration / 60);
      const maxCallCost = pricePerMinute * maxCallMinutes;

      if (!user.wallet || user.wallet.balance < pricePerMinute) {
        throw new BadRequestException(
          `Insufficient balance. Required: ₹${pricePerMinute} per minute. Your balance: ₹${user.wallet?.balance || 0}`
        );
      }

      // Generate Agora token
      const callerUid = this.streamAgoraService.generateUid();
      const callerToken = this.streamAgoraService.generateBroadcasterToken(
        stream.agoraChannelName!,
        callerUid
      );

      // Update stream
      stream.currentCall = {
        isOnCall: true,
        callerId: request.userId,
        callerName: request.userName,
        callType: request.callType,
        callMode: request.callMode,
        startedAt: new Date(),
        callerAgoraUid: callerUid,
        isCameraOn: request.callType === 'video'
      };
      stream.currentState = 'on_call';
      stream.callWaitlist[requestIndex].status = 'accepted';

      await stream.save();

      // ✅ Create call transaction (will charge at end)
      const transaction = new this.callTransactionModel({
        streamId,
        astrologerId: new Types.ObjectId(hostId),
        userId: new Types.ObjectId(userId),
        callType: request.callType,
        callMode: request.callMode,
        startedAt: new Date(),
        pricePerMinute,
        status: 'completed',
        createdAt: new Date()
      });

      await transaction.save();

      this.logger.log(`✅ Call accepted - Will charge at end`);

      return {
        success: true,
        message: 'Call request accepted',
        data: {
          callId: transaction._id,
          channelName: stream.agoraChannelName,
          token: callerToken,
          uid: callerUid,
          callerAgoraUid: callerUid,
          hostAgoraUid: stream.hostAgoraUid,
          appId: this.streamAgoraService.getAppId(),
          callType: request.callType,
          callMode: request.callMode,
          maxDuration: stream.callSettings.maxCallDuration,
          pricePerMinute,
          maxCallCost
        }
      };
    } catch (error) {
      this.logger.error('❌ Accept call error:', error);
      throw error;
    }
  }

  async rejectCallRequest(streamId: string, userId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    const requestIndex = stream.callWaitlist.findIndex(
      req => req.userId.toString() === userId && req.status === 'waiting'
    );

    if (requestIndex === -1) {
      throw new BadRequestException('Call request not found');
    }

    stream.callWaitlist[requestIndex].status = 'rejected';

    let position = 1;
    stream.callWaitlist.forEach((req) => {
      if (req.status === 'waiting') {
        req.position = position++;
      }
    });

    await stream.save();

    this.logger.log(`❌ Call request rejected: ${userId}`);

    return {
      success: true,
      message: 'Call request rejected'
    };
  }

  /**
   * ✅ End current call - DEDUCT PAYMENT AT END (LIKE CHAT/CALL)
   */
  async endCurrentCall(streamId: string, hostId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId, hostId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (!stream.currentCall?.isOnCall) {
      throw new BadRequestException('No active call');
    }

    const endTime = new Date();
    const durationSeconds = Math.floor((endTime.getTime() - stream.currentCall.startedAt.getTime()) / 1000);

    // ✅ ROUND UP TO NEAREST MINUTE
    const billedMinutes = Math.ceil(durationSeconds / 60);

    // Find transaction
    const transaction = await this.callTransactionModel.findOne({
      streamId,
      userId: stream.currentCall.callerId,
      endedAt: { $exists: false }
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    // ✅ Calculate actual charge
    const actualCharge = billedMinutes * transaction.pricePerMinute;

    // ✅ Get user and astrologer names
    const [user, astrologer] = await Promise.all([
      this.userModel.findById(transaction.userId).select('name').lean(),
      this.astrologerModel.findById(transaction.astrologerId).select('name').lean()
    ]);

    if (!user || !astrologer) {
      throw new NotFoundException('User or Astrologer not found');
    }

    // ✅ DEDUCT FROM USER (SIMPLE DEDUCTION AT END)
    const deductResult = await this.walletService.deductFromUser(
      transaction.userId.toString(),
      actualCharge,
      'stream_call',
      `${billedMinutes} min ${transaction.callType} call with ${astrologer.name}`,
      {
        streamId,
        astrologerId: transaction.astrologerId.toString(),
        astrologerName: astrologer.name,
        callType: transaction.callType,
        duration: durationSeconds,
        billedMinutes,
        pricePerMinute: transaction.pricePerMinute
      }
    );

    if (!deductResult.success) {
      this.logger.error('❌ Failed to deduct from user:', deductResult.message);
      throw new BadRequestException(deductResult.message || 'Payment failed');
    }

    // ✅ CREDIT ASTROLOGER (70% after 30% commission)
    const platformCommission = actualCharge * 0.30;
    const astrologerEarning = actualCharge * 0.70;

    const creditResult = await this.walletService.creditToAstrologer(
      transaction.astrologerId.toString(),
      astrologerEarning,
      'stream_call',
      `${billedMinutes} min ${transaction.callType} call earnings from ${user.name}`,
      {
        streamId,
        userId: transaction.userId.toString(),
        userName: user.name || 'User',
        callType: transaction.callType,
        duration: durationSeconds,
        billedMinutes,
        grossAmount: actualCharge,
        platformCommission,
        netEarning: astrologerEarning
      }
    );

    if (!creditResult.success) {
      this.logger.error('❌ Failed to credit astrologer:', creditResult.message);
    }

    // ✅ Update astrologer earnings
    await this.astrologerModel.findByIdAndUpdate(
      transaction.astrologerId,
      {
        $inc: {
          'earnings.totalEarned': actualCharge,
          'earnings.platformCommission': platformCommission,
          'earnings.netEarnings': astrologerEarning,
          'earnings.withdrawableAmount': astrologerEarning,
          'stats.totalMinutes': billedMinutes,
          'stats.callOrders': 1,
          'stats.totalOrders': 1
        },
        $set: {
          'earnings.lastUpdated': new Date()
        }
      }
    );

    // ✅ Update transaction
    transaction.endedAt = endTime;
    transaction.duration = durationSeconds;
    transaction.totalCharge = actualCharge;
    transaction.status = 'completed';
    await transaction.save();

    // Update stream
    stream.totalCallRevenue = (stream.totalCallRevenue || 0) + actualCharge;
    stream.totalRevenue = (stream.totalRevenue || 0) + actualCharge;
    stream.currentCall = undefined as any;
    stream.currentState = 'streaming';
    stream.totalCalls = (stream.totalCalls || 0) + 1;

    await stream.save();

    this.logger.log(`✅ Call ended - ${billedMinutes} min, ₹${actualCharge}, Astrologer: ₹${astrologerEarning}`);

    return {
      success: true,
      message: 'Call ended',
      data: {
        duration: durationSeconds,
        billedMinutes,
        charge: actualCharge,
        astrologerEarning,
        platformCommission
      }
    };
  }

  /**
   * ✅ End user's own call - DEDUCT AT END
   */
  async endUserCall(streamId: string, userId: string): Promise<any> {
  try {
    console.log('USER ENDING THEIR OWN CALL');
    console.log('Stream ID:', streamId);
    console.log('User ID:', userId);

    const stream = await this.streamModel.findOne({ streamId });

    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (
      !stream.currentCall?.isOnCall ||
      stream.currentCall.callerId?.toString() !== userId.toString()
    ) {
      this.logger.warn(`User ${userId} not on active call`);
      return {
        success: true,
        message: 'Call ended (already cleared)',
        data: {
          duration: 0,
          billedMinutes: 0,
          charge: 0,
        },
      };
    }

    const endTime = new Date();
    const durationSeconds = Math.floor(
      (endTime.getTime() - stream.currentCall.startedAt.getTime()) / 1000,
    );

    // ROUND UP
    const billedMinutes = Math.ceil(durationSeconds / 60);

    const transaction = await this.callTransactionModel.findOne({
      streamId,
      userId: new Types.ObjectId(userId),
      endedAt: { $exists: false },
    });

    let charge = 0;
    let astrologerEarning = 0;

    if (transaction) {
      const actualCharge = billedMinutes * transaction.pricePerMinute;
      charge = actualCharge;

      const [user, astrologer] = await Promise.all([
        this.userModel.findById(userId).select('name').lean(),
        this.astrologerModel.findById(transaction.astrologerId).select('name').lean(),
      ]);

      if (user && astrologer) {
        // ✅ USE UNIFIED PAYMENT METHOD
        const paymentResult = await this.walletService.processSessionPayment({
          userId: userId,
          astrologerId: transaction.astrologerId.toString(),
          amount: actualCharge,
          orderId: streamId,
          sessionId: streamId,
          sessionType: 'stream_call',
          userName: user?.name || 'User',
          astrologerName: astrologer?.name || 'Astrologer',
          durationMinutes: billedMinutes,
        });

        if (paymentResult.success) {
          // Calculate earnings
          const platformCommission = (actualCharge * 40) / 100;
          astrologerEarning = actualCharge - platformCommission;

          // ✅ UPDATE ASTROLOGER EARNINGS
          await this.earningsService.updateEarnings(
            transaction.astrologerId.toString(),
            actualCharge,
            'call',
          );

          // Update transaction
          transaction.endedAt = endTime;
          transaction.duration = durationSeconds;
          transaction.totalCharge = actualCharge;
          transaction.status = 'completed';
          await transaction.save();

          // Update stream
          stream.totalCallRevenue = (stream.totalCallRevenue || 0) + actualCharge;
          stream.totalRevenue = (stream.totalRevenue || 0) + actualCharge;
        }
      }
    }

    stream.currentCall = undefined as any;
    stream.currentState = 'streaming';
    stream.totalCalls = (stream.totalCalls || 0) + 1;
    await stream.save();

    this.logger.log(`User ${userId} ended call - ${billedMinutes} min, ₹${charge}`);

    return {
      success: true,
      message: 'Call ended successfully',
      data: {
        duration: durationSeconds,
        billedMinutes,
        charge,
        astrologerEarning,
      },
    };
  } catch (error: any) {
    this.logger.error('End user call error:', error);
    if (error instanceof NotFoundException || error instanceof BadRequestException) {
      return {
        success: true,
        message: 'Call already ended',
        data: {
          duration: 0,
          billedMinutes: 0,
          charge: 0,
        },
      };
    }
    throw error;
  }
}

  async cancelCallRequest(streamId: string, userId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    const requestIndex = stream.callWaitlist.findIndex(
      req => req.userId.toString() === userId && req.status === 'waiting'
    );

    if (requestIndex !== -1) {
      stream.callWaitlist.splice(requestIndex, 1);

      stream.callWaitlist.forEach((req, index) => {
        if (req.status === 'waiting') {
          req.position = index + 1;
        }
      });

      await stream.save();

      return {
        success: true,
        message: 'Call request cancelled'
      };
    }

    if (stream.currentCall?.callerId?.toString() === userId) {
      return this.endUserCall(streamId, userId);
    }

    throw new BadRequestException('No pending or active call found');
  }

  async getCallWaitlist(streamId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    const waitlist = stream.callWaitlist
      .filter(req => req.status === 'waiting')
      .sort((a, b) => a.position - b.position);

    return {
      success: true,
      data: waitlist
    };
  }

  async updateCallMode(streamId: string, mode: 'public' | 'private'): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (!stream.currentCall?.isOnCall) {
      throw new BadRequestException('No active call');
    }

    stream.currentCall.callMode = mode;
    await stream.save();

    return {
      success: true,
      message: `Call mode changed to ${mode}`,
      data: { callMode: mode }
    };
  }

  async toggleUserCamera(streamId: string, enabled: boolean): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (!stream.currentCall?.isOnCall) {
      throw new BadRequestException('No active call');
    }

    stream.currentCall.isCameraOn = enabled;
    await stream.save();

    return {
      success: true,
      message: `Camera ${enabled ? 'enabled' : 'disabled'}`,
      data: { isCameraOn: enabled }
    };
  }

  // ==================== VIEWER MANAGEMENT ====================

  async joinStream(streamId: string, userId: string): Promise<any> {
    const stream = await this.streamModel
      .findOne({ streamId })
      .populate('hostId', 'name profilePicture')
      .lean();
      
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status !== 'live') {
      throw new BadRequestException('Stream is not live');
    }

    const viewerUid = this.streamAgoraService.generateUid();
    const viewerToken = this.streamAgoraService.generateViewerToken(
      stream.agoraChannelName!,
      viewerUid
    );

    let viewer = await this.viewerModel.findOne({ streamId, userId });
    if (!viewer) {
      viewer = new this.viewerModel({
        streamId,
        userId,
        joinedAt: new Date(),
        isActive: true,
        agoraUid: viewerUid
      });
      
      await this.streamModel.findOneAndUpdate(
        { streamId },
        { $inc: { totalViews: 1 } }
      );
    } else {
      viewer.isActive = true;
      viewer.joinedAt = new Date();
      viewer.agoraUid = viewerUid;
    }

    await viewer.save();

    const activeViewers = await this.viewerModel.countDocuments({ streamId, isActive: true });
    
    await this.streamModel.findOneAndUpdate(
      { streamId },
      {
        $set: {
          viewerCount: activeViewers,
          peakViewers: Math.max(stream.peakViewers || 0, activeViewers)
        }
      }
    );

    return {
      success: true,
      data: {
        streamId: stream.streamId,
        agoraChannelName: stream.agoraChannelName,
        agoraToken: viewerToken,
        agoraUid: viewerUid,
        hostAgoraUid: stream.hostAgoraUid,
        appId: this.streamAgoraService.getAppId(),
        streamInfo: {
          title: stream.title,
          description: stream.description,
          hostId: stream.hostId,
          currentState: stream.currentState,
          viewerCount: activeViewers,
          isMicEnabled: stream.isMicEnabled,
          isCameraEnabled: stream.isCameraEnabled,
          allowComments: stream.allowComments,
          allowGifts: stream.allowGifts,
          callSettings: stream.callSettings,
          currentCall: stream.currentCall
        }
      }
    };
  }

  async leaveStream(streamId: string, userId: string): Promise<void> {
    const viewer = await this.viewerModel.findOne({ streamId, userId, isActive: true });
    if (!viewer) return;

    viewer.isActive = false;
    viewer.leftAt = new Date();

    const watchTime = Math.floor((viewer.leftAt.getTime() - viewer.joinedAt.getTime()) / 1000);
    viewer.watchTime += watchTime;

    await viewer.save();

    const stream = await this.streamModel.findOne({ streamId });
    if (stream) {
      stream.viewerCount = await this.viewerModel.countDocuments({ streamId, isActive: true });
      stream.totalWatchTime += watchTime;
      await stream.save();
    }
  }

  async getLiveStreams(page: number = 1, limit: number = 20): Promise<any> {
    const skip = (page - 1) * limit;

    const [streams, total] = await Promise.all([
      this.streamModel
        .find({ status: 'live' })
        .populate('hostId', 'name profilePicture experienceYears specializations ratings')
        .sort({ viewerCount: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.streamModel.countDocuments({ status: 'live' })
    ]);

    return {
      success: true,
      data: {
        streams,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  async getScheduledStreams(page: number = 1, limit: number = 20): Promise<any> {
    const skip = (page - 1) * limit;

    const [streams, total] = await Promise.all([
      this.streamModel
        .find({ status: 'scheduled' })
        .populate('hostId', 'name profilePicture experienceYears specializations')
        .sort({ scheduledAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.streamModel.countDocuments({ status: 'scheduled' })
    ]);

    return {
      success: true,
      data: {
        streams,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    };
  }

  async getStreamDetails(streamId: string): Promise<any> {
    const stream = await this.streamModel
      .findOne({ streamId })
      .populate('hostId', 'name profilePicture experienceYears specializations ratings')
      .lean();

    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    return {
      success: true,
      data: stream
    };
  }

  async updateStreamAnalytics(streamId: string, updates: {
    incrementLikes?: number;
    incrementComments?: number;
    incrementGifts?: number;
    addRevenue?: number;
  }): Promise<void> {
    const updateFields: any = {};

    if (updates.incrementLikes) {
      updateFields.$inc = { ...updateFields.$inc, totalLikes: updates.incrementLikes };
    }
    if (updates.incrementComments) {
      updateFields.$inc = { ...updateFields.$inc, totalComments: updates.incrementComments };
    }
    if (updates.incrementGifts) {
      updateFields.$inc = { ...updateFields.$inc, totalGifts: updates.incrementGifts };
    }
    if (updates.addRevenue) {
      updateFields.$inc = { ...updateFields.$inc, totalRevenue: updates.addRevenue };
    }

    if (Object.keys(updateFields).length > 0) {
      await this.streamModel.findOneAndUpdate({ streamId }, updateFields);
    }
  }

  // ==================== ADMIN ====================

  async getAllStreamsAdmin(filters: {
    status?: string;
    search?: string;
    page: number;
    limit: number;
  }): Promise<any> {
    const query: any = {};
    
    if (filters.status) {
      query.status = filters.status;
    }
    
    if (filters.search) {
      query.$or = [
        { streamId: { $regex: filters.search, $options: 'i' } },
        { title: { $regex: filters.search, $options: 'i' } },
      ];
    }

    const skip = (filters.page - 1) * filters.limit;

    const [streams, total] = await Promise.all([
      this.streamModel
        .find(query)
        .populate('hostId', 'name profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(filters.limit)
        .lean(),
      this.streamModel.countDocuments(query)
    ]);

    return {
      success: true,
      data: {
        streams,
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total,
          pages: Math.ceil(total / filters.limit)
        }
      }
    };
  }

  async getStreamDetailsAdmin(streamId: string): Promise<any> {
    const stream = await this.streamModel
      .findOne({ streamId })
      .populate('hostId', 'name email phoneNumber profilePicture')
      .lean();

    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    const viewers = await this.viewerModel
      .find({ streamId })
      .populate('userId', 'name profileImage')
      .sort({ watchTime: -1 })
      .limit(50)
      .lean();

    const calls = await this.callTransactionModel
      .find({ streamId })
      .populate('userId', 'name profileImage')
      .sort({ startedAt: -1 })
      .lean();

    return {
      success: true,
      data: {
        stream,
        viewers,
        calls,
        currentViewers: stream.viewerCount,
        callWaitlist: stream.callWaitlist
      }
    };
  }

  async forceEndStreamAdmin(streamId: string, reason: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status !== 'live') {
      throw new BadRequestException('Stream is not live');
    }

    if (stream.currentCall?.isOnCall) {
      await this.endCurrentCall(streamId, stream.hostId.toString());
    }

    const endTime = new Date();
    const duration = stream.startedAt 
      ? Math.floor((endTime.getTime() - stream.startedAt.getTime()) / 1000)
      : 0;

    stream.status = 'cancelled';
    stream.endedAt = endTime;
    stream.duration = duration;
    stream.currentState = 'idle';
    stream.currentCall = undefined as any;

    await this.viewerModel.updateMany(
      { streamId, isActive: true },
      { 
        $set: { 
          isActive: false,
          leftAt: endTime
        }
      }
    );

    await stream.save();

    await this.astrologerModel.findByIdAndUpdate(stream.hostId, {
      'availability.isAvailable': true,
      'availability.isLive': false,
      'availability.liveStreamId': null,
      'availability.busyUntil': null
    });

    return {
      success: true,
      message: 'Stream force ended by admin',
      data: {
        streamId: stream.streamId,
        reason,
        duration: stream.duration
      }
    };
  }

  // ==================== UTILITY ====================

  async getStreamById(streamId: string) {
    return this.streamModel.findOne({ streamId }).lean();
  }

  getAgoraService() {
    return this.streamAgoraService;
  }
}
