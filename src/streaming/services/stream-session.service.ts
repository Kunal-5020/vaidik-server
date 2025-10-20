import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StreamSession, StreamSessionDocument } from '../schemas/stream-session.schema';
import { StreamViewer, StreamViewerDocument } from '../schemas/stream-viewer.schema';
import { CallTransaction, CallTransactionDocument } from '../schemas/call-transaction.schema';
import { StreamAgoraService } from './stream-agora.service';
import { UpdateCallSettingsDto } from '../dto/update-call-settings.dto';
import { UpdateStreamDto } from '../dto/update-stream.dto';

@Injectable()
export class StreamSessionService {
  constructor(
    @InjectModel(StreamSession.name) private streamModel: Model<StreamSessionDocument>,
    @InjectModel(StreamViewer.name) private viewerModel: Model<StreamViewerDocument>,
    @InjectModel(CallTransaction.name) private callTransactionModel: Model<CallTransactionDocument>,
    private streamAgoraService: StreamAgoraService,
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

    // Generate Agora channel
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
      agoraHostUid: hostUid,
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
        uid: stream.agoraHostUid,
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
   * Start stream (go live)
   */
  async startStream(streamId: string, hostId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId, hostId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status !== 'scheduled') {
      throw new BadRequestException('Stream already started or ended');
    }

    stream.status = 'live';
    stream.currentState = 'streaming';
    stream.startedAt = new Date();
    await stream.save();

    return {
      success: true,
      message: 'Stream is now live',
      data: stream
    };
  }

  /**
   * End stream
   */
  async endStream(streamId: string, hostId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId, hostId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
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

    // Mark all active viewers as inactive
    await this.viewerModel.updateMany(
      { streamId, isActive: true },
      { 
        $set: { 
          isActive: false,
          leftAt: endTime
        }
      }
    );

    // Reject all pending call requests
    stream.callWaitlist = stream.callWaitlist.map(req => ({
      ...req,
      status: 'expired'
    }));

    await stream.save();

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
   * Delete stream
   */
  async deleteStream(streamId: string, hostId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId, hostId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status !== 'scheduled') {
      throw new BadRequestException('Can only delete scheduled streams');
    }

    await stream.deleteOne();

    return {
      success: true,
      message: 'Stream deleted successfully'
    };
  }

  // ==================== STREAM CONTROLS ====================

  /**
   * Toggle microphone
   */
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

  /**
   * Toggle camera
   */
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

  /**
   * Update call settings
   */
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
   * Request call
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

    // Check if user already in waitlist
    const existingRequest = stream.callWaitlist.find(
      req => req.userId.toString() === userId && req.status === 'waiting'
    );

    if (existingRequest) {
      throw new BadRequestException('You already have a pending call request');
    }

    // Get user details
    const viewer = await this.viewerModel.findOne({ streamId, userId }).populate('userId', 'name profileImage');
    if (!viewer) {
      throw new BadRequestException('You must join the stream first');
    }

    const user: any = viewer.userId;

    // Add to waitlist
    const position = stream.callWaitlist.filter(req => req.status === 'waiting').length + 1;

    stream.callWaitlist.push({
      userId: new Types.ObjectId(userId),
      userName: user.name,
      userAvatar: user.profileImage,
      callType,
      callMode,
      requestedAt: new Date(),
      position,
      status: 'waiting'
    });

    await stream.save();

    return {
      success: true,
      message: 'Call request sent successfully',
      data: {
        position,
        waitingCount: stream.callWaitlist.filter(req => req.status === 'waiting').length,
        estimatedWaitTime: position * 600 // 10 minutes per call
      }
    };
  }

  /**
   * Cancel call request
   */
  async cancelCallRequest(streamId: string, userId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    const requestIndex = stream.callWaitlist.findIndex(
      req => req.userId.toString() === userId && req.status === 'waiting'
    );

    if (requestIndex === -1) {
      throw new BadRequestException('No pending call request found');
    }

    stream.callWaitlist.splice(requestIndex, 1);

    // Reorder positions
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

  /**
   * Get call waitlist
   */
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

  /**
   * Accept call request
   */
  async acceptCallRequest(streamId: string, userId: string, hostId: string): Promise<any> {
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

    // Generate Agora token for caller
    const callerUid = this.streamAgoraService.generateUid();
    const callerToken = this.streamAgoraService.generateBroadcasterToken(
      stream.agoraChannelName!,
      callerUid
    );

    // Calculate price
    const pricePerMinute = request.callType === 'video' 
      ? stream.callSettings.videoCallPrice 
      : stream.callSettings.voiceCallPrice;

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

    // Create call transaction
    const transaction = new this.callTransactionModel({
      streamId,
      astrologerId: stream.hostId,
      userId: new Types.ObjectId(userId),
      callType: request.callType,
      callMode: request.callMode,
      startedAt: new Date(),
      pricePerMinute,
      status: 'completed',
      createdAt: new Date()
    });

    await transaction.save();

    return {
      success: true,
      message: 'Call request accepted',
      data: {
        callId: transaction._id,
        channelName: stream.agoraChannelName,
        token: callerToken,
        uid: callerUid,
        appId: this.streamAgoraService.getAppId(),
        callType: request.callType,
        callMode: request.callMode,
        maxDuration: stream.callSettings.maxCallDuration
      }
    };
  }

  /**
   * Reject call request
   */
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

    // Reorder waiting positions
    let position = 1;
    stream.callWaitlist.forEach((req) => {
      if (req.status === 'waiting') {
        req.position = position++;
      }
    });

    await stream.save();

    return {
      success: true,
      message: 'Call request rejected'
    };
  }

  /**
   * End current call
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
    const duration = Math.floor((endTime.getTime() - stream.currentCall.startedAt.getTime()) / 1000);

    // Find and update transaction
    const transaction = await this.callTransactionModel.findOne({
      streamId,
      userId: stream.currentCall.callerId,
      endedAt: { $exists: false }
    });

    if (transaction) {
      transaction.endedAt = endTime;
      transaction.duration = duration;
      transaction.totalCharge = (duration / 60) * transaction.pricePerMinute;
      await transaction.save();

      // Update stream revenue
      stream.totalCallRevenue += transaction.totalCharge;
      stream.totalRevenue += transaction.totalCharge;
    }

    // Clear current call
    stream.currentCall = undefined as any;
    stream.currentState = 'streaming';
    stream.totalCalls += 1;

    await stream.save();

    return {
      success: true,
      message: 'Call ended',
      data: {
        duration,
        charge: transaction?.totalCharge || 0
      }
    };
  }

  /**
   * Update call mode (public/private)
   */
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

  /**
   * Toggle user camera
   */
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

  /**
   * Join stream (viewer)
   */
  async joinStream(streamId: string, userId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status !== 'live') {
      throw new BadRequestException('Stream is not live');
    }

    // Generate viewer token
    const viewerUid = this.streamAgoraService.generateUid();
    const viewerToken = this.streamAgoraService.generateViewerToken(
      stream.agoraChannelName!,
      viewerUid
    );

    // Create or update viewer record
    let viewer = await this.viewerModel.findOne({ streamId, userId });
    if (!viewer) {
      viewer = new this.viewerModel({
        streamId,
        userId,
        joinedAt: new Date(),
        isActive: true,
        agoraUid: viewerUid
      });
      
      stream.totalViews += 1;
    } else {
      viewer.isActive = true;
      viewer.joinedAt = new Date();
      viewer.agoraUid = viewerUid;
    }

    await viewer.save();

    // Update viewer count
    const activeViewers = await this.viewerModel.countDocuments({ streamId, isActive: true });
    stream.viewerCount = activeViewers;
    if (activeViewers > stream.peakViewers) {
      stream.peakViewers = activeViewers;
    }

    await stream.save();

    return {
      success: true,
      data: {
        streamId: stream.streamId,
        channelName: stream.agoraChannelName,
        token: viewerToken,
        uid: viewerUid,
        appId: this.streamAgoraService.getAppId(),
        streamInfo: {
          title: stream.title,
          description: stream.description,
          currentState: stream.currentState,
          viewerCount: stream.viewerCount,
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

  /**
   * Leave stream
   */
  async leaveStream(streamId: string, userId: string): Promise<void> {
    const viewer = await this.viewerModel.findOne({ streamId, userId, isActive: true });
    if (!viewer) return;

    viewer.isActive = false;
    viewer.leftAt = new Date();

    const watchTime = Math.floor((viewer.leftAt.getTime() - viewer.joinedAt.getTime()) / 1000);
    viewer.watchTime += watchTime;

    await viewer.save();

    // Update stream
    const stream = await this.streamModel.findOne({ streamId });
    if (stream) {
      stream.viewerCount = await this.viewerModel.countDocuments({ streamId, isActive: true });
      stream.totalWatchTime += watchTime;
      await stream.save();
    }
  }

  /**
   * Get live streams
   */
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

  /**
   * Get scheduled streams
   */
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

  /**
   * Get stream details
   */
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

  /**
   * Update stream analytics
   */
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

  // Add these methods at the end of the StreamSessionService class

/**
 * Get all streams (Admin)
 */
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

/**
 * Get stream details (Admin)
 */
async getStreamDetailsAdmin(streamId: string): Promise<any> {
  const stream = await this.streamModel
    .findOne({ streamId })
    .populate('hostId', 'name email phoneNumber profilePicture')
    .lean();

  if (!stream) {
    throw new NotFoundException('Stream not found');
  }

  // Get viewers
  const viewers = await this.viewerModel
    .find({ streamId })
    .populate('userId', 'name profileImage')
    .sort({ watchTime: -1 })
    .limit(50)
    .lean();

  // Get call transactions
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

/**
 * Force end stream (Admin)
 */
async forceEndStreamAdmin(streamId: string, reason: string): Promise<any> {
  const stream = await this.streamModel.findOne({ streamId });
  if (!stream) {
    throw new NotFoundException('Stream not found');
  }

  if (stream.status !== 'live') {
    throw new BadRequestException('Stream is not live');
  }

  // End current call if any
  if (stream.currentCall?.isOnCall) {
    const endTime = new Date();
    const duration = Math.floor((endTime.getTime() - stream.currentCall.startedAt.getTime()) / 1000);

    // Update transaction
    await this.callTransactionModel.findOneAndUpdate(
      {
        streamId,
        userId: stream.currentCall.callerId,
        endedAt: { $exists: false }
      },
      {
        endedAt: endTime,
        duration,
        status: 'cancelled'
      }
    );
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

  // Mark all active viewers as inactive
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

}

