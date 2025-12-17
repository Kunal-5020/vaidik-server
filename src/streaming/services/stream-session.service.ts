// streaming/services/stream-session.service.ts

import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StreamSession, StreamSessionDocument } from '../schemas/stream-session.schema';
import { StreamViewer, StreamViewerDocument } from '../schemas/stream-viewer.schema';
import { CallTransaction, CallTransactionDocument } from '../schemas/call-transaction.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { StreamAgoraService } from './stream-agora.service';
import { StreamRecordingService } from './stream-recording.service';
import { StreamGateway } from '../gateways/streaming.gateway';
import { WalletService } from '../../payments/services/wallet.service';
import { EarningsService } from '../../astrologers/services/earnings.service';
import { CreateStreamDto } from '../dto/create-stream.dto';

@Injectable()
export class StreamSessionService {
  private readonly logger = new Logger(StreamSessionService.name);

  constructor(
    @InjectModel(StreamSession.name) private streamModel: Model<StreamSessionDocument>,
    @InjectModel(StreamViewer.name) private viewerModel: Model<StreamViewerDocument>,
    @InjectModel(CallTransaction.name) private callTransactionModel: Model<CallTransactionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private streamRecordingService: StreamRecordingService,
    private streamAgoraService: StreamAgoraService,
    private walletService: WalletService,
    private earningsService: EarningsService,
    @Inject(forwardRef(() => StreamGateway)) private streamGateway: StreamGateway,
  ) {}

  // ==================== INSTANT GO LIVE ====================

  async goLive(hostId: string, settings: CreateStreamDto): Promise<any> {
  const astrologer = await this.astrologerModel.findById(hostId).select('name');
  if (!astrologer) throw new NotFoundException('Astrologer not found');

  // 🔐 Ensure single active stream per astrologer
  const existingLiveStream = await this.streamModel.findOne({
    hostId,
    status: 'live',
  });

  if (existingLiveStream) {
    this.logger.warn(
      `Astrologer ${hostId} already has live stream ${existingLiveStream.streamId}. Force-ending it before starting new one.`,
    );

    // This will also end any active call, stop recording, and fix availability
    await this.endStream(existingLiveStream.streamId, hostId);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const count = await this.streamModel.countDocuments({
    hostId,
    createdAt: { $gte: today },
  });

  const title =
    count === 0 ? astrologer.name : `${astrologer.name} #${count + 1}`;

  const streamId = `LIVE_${Date.now()}_${Math.random()
    .toString(36)
    .substring(7)
    .toUpperCase()}`;
  const channelName = this.streamAgoraService.generateChannelName();
  const hostUid = this.streamAgoraService.generateUid();
  const token =
    this.streamAgoraService.generateBroadcasterToken(channelName, hostUid);

  const stream = new this.streamModel({
    streamId,
    hostId,
    title,
    status: 'live',
    currentState: 'streaming',
    startedAt: new Date(),
    agoraChannelName: channelName,
    agoraToken: token,
    hostAgoraUid: hostUid,
    callSettings: {
      isCallEnabled: true,
      voiceCallPrice: settings.voiceCallPrice ?? 50,
      videoCallPrice: settings.videoCallPrice ?? 100,
      allowPublicCalls: settings.allowPublicCalls ?? true,
      allowPrivateCalls: settings.allowPrivateCalls ?? true,
      maxCallDuration: settings.maxCallDuration ?? 600,
    },
    callWaitlist: [],
    createdAt: new Date(),
  });

  await stream.save();

  try {
      const recorderUid = this.streamAgoraService.generateUid().toString();
      const recResult = await this.streamRecordingService.startRecording(
        channelName,
        recorderUid,
        streamId
      );
      
      stream.isRecording = true;
      stream.recordingResourceId = recResult.resourceId;
      stream.recordingSid = recResult.sid;
      stream.recordingUid = recorderUid;

      await stream.save();
      this.logger.log(`🎥 Auto-recording started for stream ${streamId}`);
    } catch (e) {
      this.logger.error(`⚠️ Failed to auto-start recording for ${streamId}: ${e.message}`);
      // Don't fail the stream start just because recording failed, but log it.
    }

  await this.astrologerModel.findByIdAndUpdate(hostId, {
    'availability.isOnline': true,
    'availability.isAvailable': false,
    'availability.isLive': true,
    'availability.liveStreamId': streamId,
    'availability.lastActive': new Date(),
  });

  return {
    success: true,
    message: 'You are Live!',
    data: {
      streamId,
      channelName,
      token,
      uid: hostUid,
      appId: this.streamAgoraService.getAppId(),
      title,
    },
  };
}

  async endStream(streamId: string, hostId?: string): Promise<any> {
    this.logger.log(`🔄 endStream called`, { streamId, hostId });

    let stream = await this.streamModel.findOne(hostId ? { streamId, hostId } : { streamId });
    if (!stream && hostId) stream = await this.streamModel.findOne({ streamId });
    if (!stream) throw new NotFoundException('Stream not found');

    if (stream.status === 'ended') return { success: true, message: 'Already ended' };

    if (stream.currentCall?.isOnCall) {
        await this.endCurrentCall(streamId, stream.hostId.toString());
    }

    // ✅ FIX: TRIGGER BACKGROUND RECORDING STOP
    if (stream.isRecording && stream.recordingResourceId && stream.recordingSid) {
        this.handleBackgroundStreamStop(stream);
    }

    stream.status = 'ended';
    stream.endedAt = new Date();
    stream.currentState = 'idle';
    stream.callWaitlist = [];
    stream.isRecording = false; // Mark as not recording instantly

    if (stream.startedAt) {
        stream.duration = Math.floor((stream.endedAt.getTime() - stream.startedAt.getTime()) / 1000);
    }

    await stream.save();

    await this.astrologerModel.findByIdAndUpdate(stream.hostId, {
        'availability.isAvailable': true,
        'availability.isLive': false,
        'availability.liveStreamId': null,
        'availability.lastActive': new Date(),
    });

    return { success: true, message: 'Stream Ended', data: { duration: stream.duration } };
  }

  // ✅ NEW BACKGROUND METHOD
  private async handleBackgroundStreamStop(stream: StreamSessionDocument) {
      try {
          const stopResult = await this.streamRecordingService.stopRecording(
            stream.agoraChannelName!,
            stream.recordingUid!,
            stream.recordingResourceId!,
            stream.recordingSid!,
            stream.streamId
          );
          
          if (stopResult.recordingUrl) {
             // Re-fetch to avoid version error, though less likely here
             await this.streamModel.updateOne(
                 { streamId: stream.streamId },
                 { $set: { recordingFiles: [stopResult.recordingUrl] } }
             );
             this.logger.log(`🎥 Stream recording updated in background for ${stream.streamId}`);
          }
      } catch (e) {
          this.logger.error('Failed to stop stream recording in background', e);
      }
  }

  async getStreamsByHost(hostId: string, filters: any) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;
    
    const query: any = { hostId };
    if (filters.status) query.status = filters.status;

    const streams = await this.streamModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    return { success: true, data: streams };
  }

  // ==================== CALL MANAGEMENT ====================

  async requestCall(streamId: string, userId: string, callType: 'voice' | 'video', callMode: 'public' | 'private'): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId, status: 'live' });
    if (!stream) throw new NotFoundException('Stream not live');

    const price = callType === 'voice' ? stream.callSettings.voiceCallPrice : stream.callSettings.videoCallPrice;
    const minRequired = price * 5; 
    
    const user = await this.userModel.findById(userId).select('name wallet profilePicture').lean() as any;
    if (!user) throw new NotFoundException('User not found');

    if (user.wallet.balance < minRequired) {
      throw new BadRequestException(`Insufficient balance. Minimum 5 mins (₹${minRequired}) required.`);
    }

    const position = stream.callWaitlist.filter(req => req.status === 'waiting').length + 1;
    
    stream.callWaitlist.push({
      userId: new Types.ObjectId(userId),
      userName: user.name,
      userAvatar: user.profilePicture,
      callType,
      callMode,
      requestedAt: new Date(),
      position,
      status: 'waiting'
    });

    await stream.save();

    this.streamGateway.notifyCallRequest(streamId,
      stream.hostId.toString(), {
      userId, userName: user.name, userAvatar: user.profilePicture, callType, callMode, position
    });

    const formattedWaitlist = await this.getCallWaitlist(streamId);
    const myEntry = formattedWaitlist.data.find((w: any) => w.userId.toString() === userId);

    return {
      success: true,
      message: 'Added to waitlist',
      data: {
        position,
        estimatedWaitTime: myEntry?.estimatedWaitTime || 0
      }
    };
  }

  async getCallWaitlist(streamId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) throw new NotFoundException('Stream not found');

    const waitingUsers = stream.callWaitlist.filter(req => req.status === 'waiting');
    
    let cumulativeWaitTime = 0;

    if (stream.currentCall?.isOnCall && stream.currentCall.startedAt) {
       const elapsed = (Date.now() - new Date(stream.currentCall.startedAt).getTime()) / 1000;
       const remaining = Math.max(0, stream.callSettings.maxCallDuration - elapsed);
       cumulativeWaitTime += remaining;
    }

    const formatted = waitingUsers.map((req) => {
      const waitTime = cumulativeWaitTime;
      cumulativeWaitTime += stream.callSettings.maxCallDuration; 
      
      return {
        userId: req.userId,
        userName: req.userName,
        position: req.position,
        estimatedWaitTime: Math.ceil(waitTime / 60)
      };
    });

    return { success: true, data: formatted };
  }

  async acceptCallRequest(streamId: string, userId: string, hostId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId, hostId });
    if (!stream) throw new NotFoundException('Stream not found');
    
    if (stream.currentCall?.isOnCall) {
       throw new BadRequestException('Already on a call');
    }

    const reqIndex = stream.callWaitlist.findIndex(r => r.userId.toString() === userId && r.status === 'waiting');
    if (reqIndex === -1) throw new BadRequestException('Request not found');

    const request = stream.callWaitlist[reqIndex];

    // ✅ CHECK BALANCE & CALCULATE MAX DURATION
    const user = await this.userModel.findById(userId).select('wallet').lean() as any;
    const price = request.callType === 'video' ? stream.callSettings.videoCallPrice : stream.callSettings.voiceCallPrice;
    
    const minRequired = price * 5; // 5 mins minimum rule
    if (user.wallet.balance < minRequired) {
       stream.callWaitlist[reqIndex].status = 'expired';
       await stream.save();
       throw new BadRequestException('User balance insufficient');
    }

    // ✅ Calculation Logic
    const affordableMinutes = Math.floor(user.wallet.balance / price);
    const affordableSeconds = affordableMinutes * 60;
    
    // Take the smaller of: Wallet Limit vs Stream Settings Limit
    const sessionLimitSeconds = stream.callSettings.maxCallDuration; 
    const finalMaxDuration = Math.min(affordableSeconds, sessionLimitSeconds);

    const callerUid = this.streamAgoraService.generateUid();
    const callerToken = this.streamAgoraService.generateBroadcasterToken(stream.agoraChannelName!, callerUid);

    const transaction = await this.callTransactionModel.create({
      streamId,
      astrologerId: hostId,
      userId,
      callType: request.callType,
      callMode: request.callMode,
      pricePerMinute: price,
      startedAt: new Date(),
      status: 'ongoing'
    });

    stream.currentCall = {
      isOnCall: true,
      callerId: request.userId,
      callerName: request.userName,
      callType: request.callType,
      callMode: request.callMode,
      startedAt: new Date(),
      callerAgoraUid: callerUid,
      hostAgoraUid: stream.hostAgoraUid,
      isCameraOn: request.callType === 'video'
    };
    stream.currentState = 'on_call';
    stream.callWaitlist[reqIndex].status = 'accepted';

    await stream.save();

    return {
      success: true,
      data: {
        token: callerToken,
        uid: callerUid,
        callerAgoraUid: callerUid,
        hostAgoraUid: stream.hostAgoraUid,
        channelName: stream.agoraChannelName,
        maxDuration: finalMaxDuration
      }
    };
  }

  async rejectCallRequest(streamId: string, userId: string) {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) throw new NotFoundException('Stream not found');

    const index = stream.callWaitlist.findIndex(r => r.userId.toString() === userId && r.status === 'waiting');
    if (index !== -1) {
      stream.callWaitlist[index].status = 'rejected';
      await stream.save();
      return { success: true, message: 'Request rejected' };
    }
    throw new BadRequestException('Request not found');
  }

// Find the cancelCallRequest method and replace it with this:

async cancelCallRequest(streamId: string, userId: string) {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) throw new NotFoundException('Stream not found');

    if (stream.currentCall?.isOnCall && stream.currentCall.callerId.toString() === userId) {
        this.logger.warn(`⚠️ User ${userId} cancelled ACTIVE call. Ending session properly.`);
        
        // ✅ FIX: Call endCurrentCall to ensure BILLING happens
        // Just resetting variables would give the user a free call.
        await this.endCurrentCall(streamId, stream.hostId.toString());
        
        this.streamGateway.server.to(streamId).emit('user_ended_call', { userId });
        this.streamGateway.server.to(streamId).emit('stream_state_updated', { state: 'streaming' });

        return { success: true, message: 'Active call ended by user' };
    }

    const index = stream.callWaitlist.findIndex(r => r.userId.toString() === userId && r.status === 'waiting');
    if (index !== -1) {
      stream.callWaitlist.splice(index, 1);
      stream.callWaitlist.filter(r => r.status === 'waiting').forEach((r, i) => r.position = i + 1);
      await stream.save();
      return { success: true, message: 'Request cancelled' };
    }
    return { success: false, message: 'Request not found' };
  }

async endCurrentCall(streamId: string, hostId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream || !stream.currentCall?.isOnCall) return { success: true, message: 'No active call' };

    // ✅ FIX: Improved transaction lookup with fallback
    // 1. Try strict match
    let transaction = await this.callTransactionModel.findOne({
      streamId,
      userId: stream.currentCall.callerId, 
      status: 'ongoing'
    });

    // 2. Fallback: If strict match fails (e.g., ObjectId vs String mismatch), find ANY ongoing transaction for this stream
    if (!transaction) {
       this.logger.warn(`Strict transaction lookup failed for stream ${streamId}. Trying fallback...`);
       transaction = await this.callTransactionModel.findOne({
         streamId,
         status: 'ongoing'
       }).sort({ createdAt: -1 });
    }

    if (transaction) {
      const endTime = new Date();
      const durationSec = Math.floor((endTime.getTime() - transaction.startedAt.getTime()) / 1000);
      
      // ✅ Force minimum 1 minute
      let billedMin = Math.ceil(durationSec / 60);
      if (billedMin < 1) billedMin = 1; 

      const cost = billedMin * transaction.pricePerMinute;

      const astrologer = await this.astrologerModel.findById(transaction.astrologerId).select('name');
      const astrologerName = astrologer?.name || 'Astrologer';

      if (transaction.startedAt) {
        try {
          this.logger.log(`💰 Processing Payment: ₹${cost} for ${billedMin} mins`);

          // Atomic Payment Processing
          await this.walletService.processSessionPayment({
            userId: transaction.userId.toString(),
            astrologerId: transaction.astrologerId.toString(),
            amount: cost,
            orderId: transaction._id.toString(),
            sessionId: streamId,
            sessionType: 'stream_call',
            userName: stream.currentCall.callerName,
            astrologerName: astrologerName,
            durationMinutes: billedMin
          });

          await this.earningsService.updateEarnings(transaction.astrologerId.toString(), cost, 'call');

          transaction.totalCharge = cost;
          transaction.status = 'completed';
          
          stream.totalCallRevenue += cost;
          stream.totalRevenue += cost;
          stream.totalCalls += 1;
          
          this.logger.log(`✅ Payment Success: Transaction ID ${transaction._id}`);

        } catch (error: any) {
          this.logger.error(`❌ Payment Failed: ${error.message}`);
          transaction.status = 'payment_failed'; 
          transaction.totalCharge = 0;
        }

        transaction.endedAt = endTime;
        transaction.duration = durationSec;
        await transaction.save();

        this.streamGateway.notifyCallEnded(streamId, durationSec, cost);
      }
    } else {
        this.logger.error(`❌ No ongoing transaction found for stream ${streamId} during endCurrentCall`);
    }

    stream.currentCall = undefined as any;
    stream.currentState = 'streaming';
    await stream.save();

    return { success: true, message: 'Call ended' };
  }

  // ✅ NEW: Follow Logic
  async toggleFollow(streamId: string, userId: string) {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) throw new NotFoundException('Stream not found');

    const hostId = stream.hostId;
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    // Check favoriteAstrologers array
    const favorites = user.favoriteAstrologers || [];
    const isFollowing = favorites.some(id => id.toString() === hostId.toString());

    if (isFollowing) {
      await this.userModel.findByIdAndUpdate(userId, { $pull: { favoriteAstrologers: hostId } });
      return { 
        success: true, 
        message: 'Removed from favorites', 
        data: { isFollowing: false } // ✅ Return in 'data' object
      };
    } else {
      await this.userModel.findByIdAndUpdate(userId, { $addToSet: { favoriteAstrologers: hostId } });
      return { 
        success: true, 
        message: 'Added to favorites', 
        data: { isFollowing: true } 
      };
    }
  }
  
  // ✅ NEW: Handle Caller Disconnection
  async handleUserDisconnect(userId: string) {
    // 🛡️ SECURITY FIX: Validate ID before casting to ObjectId
    if (!userId || userId === 'undefined' || !Types.ObjectId.isValid(userId)) {
        return; // Ignore invalid IDs to prevent BSON crash
    }

    // Find if this user is currently on a call in ANY active stream
    const activeStream = await this.streamModel.findOne({
        'currentCall.isOnCall': true,
        'currentCall.callerId': new Types.ObjectId(userId),
        status: 'live'
    });

    if (activeStream) {
        this.logger.log(`🔌 User ${userId} disconnected while on call in stream ${activeStream.streamId}. Ending call...`);
        await this.endCurrentCall(activeStream.streamId, activeStream.hostId.toString());
    }
  }

  async endUserCall(streamId: string, userId: string) {
     return this.endCurrentCall(streamId, userId);
  }

  // ==================== VIEWER (STRICT COUNT FIX) ====================

  async joinStream(streamId: string, userId: string) {
    // 1. Get Stream
    const stream = await this.streamModel
      .findOne({ streamId })
      .populate('hostId', 'name profilePicture')
      .lean() as any;
      
    if (!stream || stream.status !== 'live') {
      throw new NotFoundException('Stream not live');
    }

    // 2. Generate Viewer Token
    const uid = this.streamAgoraService.generateUid();
    const token = this.streamAgoraService.generateViewerToken(stream.agoraChannelName, uid);

    // 3. Update/Create Viewer Record (Atomic Check)
    // ✅ FIX: Use { new: false } to check PREVIOUS state to prevent duplicate counts
    const oldViewerState = await this.viewerModel.findOneAndUpdate(
      { streamId, userId },
      { 
        $set: { 
          isActive: true, 
          joinedAt: new Date(), 
          agoraUid: uid 
        } 
      },
      { upsert: true, new: false } // Returns the document BEFORE update
    );

    // Check if user was ALREADY active
    const wasAlreadyActive = oldViewerState && oldViewerState.isActive;

    // ✅ Only increment if they were NOT active before
    if (!wasAlreadyActive) {
      const updatedStream = await this.streamModel.findOneAndUpdate(
        { streamId: streamId }, 
        { $inc: { totalViews: 1, viewerCount: 1 } }, // Increment both
        { new: true } 
      );

      // Emit event
      if (this.streamGateway && this.streamGateway.server && updatedStream) {
        this.streamGateway.server.to(streamId).emit('viewer_count_updated', {
          count: updatedStream.viewerCount,
          timestamp: new Date()
        });
      }

      // Sync local stream object for return
      if (updatedStream) stream.viewerCount = updatedStream.viewerCount;
    }

    return {
      success: true,
      data: {
        streamId: stream.streamId,
        agoraChannelName: stream.agoraChannelName,
        agoraToken: token,
        agoraUid: uid,
        hostAgoraUid: stream.hostAgoraUid,
        appId: this.streamAgoraService.getAppId(),
        streamInfo: {
          title: stream.title,
          hostId: stream.hostId,
          currentState: stream.currentState,
          callSettings: stream.callSettings,
          currentCall: stream.currentCall,
          viewerCount: stream.viewerCount || 0
        }
      }
    };
  }

  async leaveStream(streamId: string, userId: string) {
    // ✅ Safe: only finds if isActive is true
    const viewer = await this.viewerModel.findOne({ streamId, userId, isActive: true });
    
    if (viewer) {
      viewer.isActive = false;
      const leftAt = new Date();
      const watchTime = Math.floor((leftAt.getTime() - viewer.joinedAt.getTime()) / 1000);
      viewer.watchTime += watchTime;
      await viewer.save();

      // ✅ Decrement safely
      const updatedStream = await this.streamModel.findOneAndUpdate(
        { streamId }, 
        { $inc: { viewerCount: -1, totalWatchTime: watchTime } },
        { new: true }
      );

      if (this.streamGateway && this.streamGateway.server && updatedStream) {
        this.streamGateway.server.to(streamId).emit('viewer_count_updated', {
          count: updatedStream.viewerCount,
          timestamp: new Date()
        });
      }
    }
  }

  // ==================== UTILS ====================

  async updateCallMode(streamId: string, mode: 'public' | 'private') {
    await this.streamModel.findOneAndUpdate(
      { streamId, 'currentCall.isOnCall': true },
      { $set: { 'currentCall.callMode': mode } }
    );
    return { success: true, mode };
  }

  async toggleUserCamera(streamId: string, enabled: boolean) {
    await this.streamModel.findOneAndUpdate(
      { streamId, 'currentCall.isOnCall': true },
      { $set: { 'currentCall.isCameraOn': enabled } }
    );
    return { success: true, enabled };
  }

  async updateCallSettings(streamId: string, settings: any) {
    await this.streamModel.findOneAndUpdate({ streamId }, { callSettings: settings });
    return { success: true };
  }

  async getStreamDetails(streamId: string) {
    return this.streamModel.findOne({ streamId }).lean();
  }

  async getScheduledStreams(page: number, limit: number) {
    return { data: [] };
  }

 async getLiveStreams(page: number, limit: number) {
  const skip = (page - 1) * limit;
    
  const [streams, total] = await Promise.all([
      this.streamModel
        .find({ status: 'live' })
        .populate('hostId', 'name email profilePicture phoneNumber')
        .sort({ viewerCount: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.streamModel.countDocuments({ status: 'live' })
    ]);

    return {
      success: true,
      data: streams,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

async getStreamCalls(streamId: string, page: number = 1, limit: number = 50) {
  const skip = (page - 1) * limit;
  
  const [calls, total] = await Promise.all([
    this.callTransactionModel
      .find({ streamId })
      .populate('userId', 'name email profilePicture')
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.callTransactionModel.countDocuments({ streamId })
  ]);

  return {
    success: true,
    data: {
      calls: calls.map(c => ({
        id: c._id,
        userId: c.userId?._id || c.userId,
        userName: c.userId,
        callType: c.callType,
        callMode: c.callMode,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        duration: c.duration,
        totalCharge: c.totalCharge,
        status: c.status
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  };
}

async getStreamViewers(streamId: string) {
  const viewers = await this.viewerModel
    .find({ streamId, isActive: true })
    .populate('userId', 'name email profilePicture')
    .sort({ joinedAt: -1 })
    .lean();

  return {
    success: true,
    data: viewers.map(v => ({
      id: v._id,
      userId: v.userId?._id || v.userId,
      joinedAt: v.joinedAt,
      watchTime: v.watchTime,
      isActive: v.isActive
    }))
  };
}

async getAllStreamsAdmin(filters: {
  status?: string;
  search?: string;
  page: number;
  limit: number;
}) {
  const { status, search, page, limit } = filters;
  const skip = (page - 1) * limit;
  
  const query: any = {};
  
  if (status && status !== 'all') {
    query.status = status;
  }
  
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { streamId: { $regex: search, $options: 'i' } }
    ];
  }

  const [streams, total] = await Promise.all([
      this.streamModel
        .find(query)
        .populate('hostId', 'name email profilePicture phoneNumber')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.streamModel.countDocuments(query)
    ]);

    return {
      success: true,
      data: streams,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }
  
async getStreamDetailsAdmin(streamId: string) {
  const stream = await this.streamModel
      .findOne({ streamId })
      .populate('hostId', 'name email profilePicture phoneNumber')
      .lean();

    if (!stream) {
      throw new NotFoundException(`Stream ${streamId} not found`);
    }

    const viewers = await this.viewerModel
      .find({ streamId, isActive: true })
      .populate('userId', 'name email profilePicture')
      .sort({ joinedAt: -1 })
      .lean();

    const calls = await this.callTransactionModel
      .find({ streamId })
      .populate('userId', 'name email profilePicture')
      .sort({ startedAt: -1 })
      .limit(50)
      .lean();

    const waitlist = await this.getCallWaitlist(streamId);

    return {
      success: true,
      data: {
        stream: {
          ...stream,
          hostId: stream.hostId?._id || stream.hostId,
        },
        viewers: viewers.map(v => ({
          id: v._id,
          userId: v.userId?._id || v.userId,
          joinedAt: v.joinedAt,
          watchTime: v.watchTime,
          isActive: v.isActive
        })),
        calls: calls.map(c => ({
          id: c._id,
          userId: c.userId?._id || c.userId,
          callType: c.callType,
          callMode: c.callMode,
          startedAt: c.startedAt,
          endedAt: c.endedAt,
          duration: c.duration,
          totalCharge: c.totalCharge,
          status: c.status
        })),
        callWaitlist: waitlist.data
      }
    };
  }

async forceEndStreamAdmin(streamId: string, reason: string): Promise<any> {
  const stream = await this.streamModel.findOne({ streamId });
  
  if (!stream) {
    throw new NotFoundException(`Stream ${streamId} not found`);
  }

  if (stream.status === 'ended') {
    return { 
      success: true, 
      message: 'Stream already ended',
      alreadyEnded: true 
    };
  }

  if (this.streamGateway?.server) {
    this.streamGateway.server.to(streamId).emit('stream_force_ended', {
      reason,
      adminAction: true,
      adminUserId: 'admin',
      timestamp: new Date().toISOString(),
      streamTitle: stream.title
    });
  }

  if (stream.currentCall?.isOnCall) {
    await this.endCurrentCall(streamId, stream.hostId.toString());
  }

  const result = await this.endStream(streamId, stream.hostId.toString());
  
  return {
    success: true,
    message: 'Stream force-ended successfully',
    data: {
      ...result.data,
      reason,
      adminAction: true,
      viewerCountAtEnd: stream.viewerCount
    }
  };
}

  async startRecording(streamId: string) {
     const stream = await this.streamModel.findOne({ streamId });
     if (!stream || stream.status !== 'live') throw new BadRequestException('Stream not live');
     if (stream.isRecording) throw new BadRequestException('Already recording');

     const recorderUid = this.streamAgoraService.generateUid().toString();
     
     // ✅ Use dedicated service
     const result = await this.streamRecordingService.startRecording(
        stream.agoraChannelName!, 
        recorderUid, 
        streamId
     );

     stream.isRecording = true;
     stream.recordingResourceId = result.resourceId;
     stream.recordingSid = result.sid;
     stream.recordingUid = recorderUid;
     await stream.save();

     return { success: true, message: 'Recording started', data: { sid: result.sid } };
  }

  async stopRecording(streamId: string) {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream || !stream.isRecording) throw new BadRequestException('Not recording');

    // ✅ Use dedicated service
    const result = await this.streamRecordingService.stopRecording(
      stream.agoraChannelName!, 
      stream.recordingUid!, 
      stream.recordingResourceId!, 
      stream.recordingSid!,
      streamId
    );

    stream.isRecording = false;
    if (result.recordingUrl) {
       stream.recordingFiles = [result.recordingUrl];
    }
    await stream.save();

    return { success: true, message: 'Recording stopped', data: result };
  }

  async getStreamById(streamId: string) {
    return this.streamModel.findOne({ streamId }).lean();
  }

  getAgoraService() {
    return this.streamAgoraService;
  }

    async updateStreamAnalytics(streamId: string, updates: {
    incrementComments?: number;
    addRevenue?: number;
  }): Promise<void> {
    const updateFields: any = {};

    if (updates.incrementComments) {
      updateFields.$inc = { ...updateFields.$inc, totalComments: updates.incrementComments };
    }
    if (updates.addRevenue) {
      updateFields.$inc = { ...updateFields.$inc, totalRevenue: updates.addRevenue };
    }

    if (Object.keys(updateFields).length > 0) {
      await this.streamModel.findOneAndUpdate({ streamId }, updateFields);
    }
  }
}