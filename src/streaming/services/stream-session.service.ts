import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StreamSession, StreamSessionDocument } from '../schemas/stream-session.schema';
import { StreamViewer, StreamViewerDocument } from '../schemas/stream-viewer.schema';
import { CallTransaction, CallTransactionDocument } from '../schemas/call-transaction.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { StreamAgoraService } from './stream-agora.service';
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
    private streamAgoraService: StreamAgoraService,
    private walletService: WalletService,
    private earningsService: EarningsService,
    @Inject(forwardRef(() => StreamGateway)) private streamGateway: StreamGateway,
  ) {}

  // ==================== INSTANT GO LIVE ====================

  async goLive(hostId: string, settings: CreateStreamDto): Promise<any> {
    const astrologer = await this.astrologerModel.findById(hostId).select('name');
    if (!astrologer) throw new NotFoundException('Astrologer not found');

    // Auto-Title: "Name #1"
    const today = new Date();
    today.setHours(0,0,0,0);
    const count = await this.streamModel.countDocuments({ 
      hostId, 
      createdAt: { $gte: today } 
    });
    
    const title = count === 0 ? astrologer.name : `${astrologer.name} #${count + 1}`;

    const streamId = `LIVE_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
    const channelName = this.streamAgoraService.generateChannelName();
    const hostUid = this.streamAgoraService.generateUid();
    const token = this.streamAgoraService.generateBroadcasterToken(channelName, hostUid);

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
        maxCallDuration: settings.maxCallDuration ?? 600
      },
      callWaitlist: [],
      createdAt: new Date()
    });

    await stream.save();

    await this.astrologerModel.findByIdAndUpdate(hostId, {
      'availability.isOnline': true,
      'availability.isAvailable': false,
      'availability.isLive': true,
      'availability.liveStreamId': streamId,
      'availability.lastActive': new Date()
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
        title
      }
    };
  }

  async endStream(streamId: string, hostId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId, hostId });
    if (!stream) throw new NotFoundException('Stream not found');
    
    if (stream.status === 'ended') return { success: true, message: 'Already ended' };

    if (stream.currentCall?.isOnCall) {
      await this.endCurrentCall(streamId, hostId);
    }

    if (stream.isRecording && stream.recordingResourceId && stream.recordingSid) {
      try {
        await this.streamAgoraService.stopRecording(
          stream.recordingResourceId,
          stream.recordingSid,
          stream.agoraChannelName!,
          stream.recordingUid!
        );
      } catch (e) {
        this.logger.error('Failed to stop recording on stream end', e);
      }
    }

    stream.status = 'ended';
    stream.endedAt = new Date();
    stream.currentState = 'idle';
    stream.callWaitlist = [];
    
    if (stream.startedAt) {
      stream.duration = Math.floor((stream.endedAt.getTime() - stream.startedAt.getTime()) / 1000);
    }

    await stream.save();

    await this.astrologerModel.findByIdAndUpdate(hostId, {
      'availability.isAvailable': true,
      'availability.isLive': false,
      'availability.liveStreamId': null
    });

    return { success: true, message: 'Stream Ended', data: { duration: stream.duration } };
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
    const minRequired = price * 5; // 5 Minute Rule
    
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

    this.streamGateway.notifyCallRequest(streamId, {
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

    // Add remaining time of current call
    if (stream.currentCall?.isOnCall && stream.currentCall.startedAt) {
       const elapsed = (Date.now() - new Date(stream.currentCall.startedAt).getTime()) / 1000;
       const remaining = Math.max(0, stream.callSettings.maxCallDuration - elapsed);
       cumulativeWaitTime += remaining;
    }

    const formatted = waitingUsers.map((req) => {
      const waitTime = cumulativeWaitTime;
      // ✅ FULL TIME: Sum of all max durations
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
    
    // ✅ Safety Check: If stream says "on call" but it's been > 1 min and no transaction exists, allow override
    // For now, strict check:
    if (stream.currentCall?.isOnCall) {
       // Optional: Add logic here to auto-fix if it's a "zombie" call
       throw new BadRequestException('Already on a call');
    }

    const reqIndex = stream.callWaitlist.findIndex(r => r.userId.toString() === userId && r.status === 'waiting');
    if (reqIndex === -1) throw new BadRequestException('Request not found');

    const request = stream.callWaitlist[reqIndex];

    // ... (Balance Check Code) ...
    const user = await this.userModel.findById(userId).select('wallet').lean() as any;
    const price = request.callType === 'video' ? stream.callSettings.videoCallPrice : stream.callSettings.voiceCallPrice;
    if (user.wallet.balance < price * 5) {
       stream.callWaitlist[reqIndex].status = 'expired';
       await stream.save();
       throw new BadRequestException('User balance insufficient');
    }

    // 1. Generate Token
    const callerUid = this.streamAgoraService.generateUid();
    const callerToken = this.streamAgoraService.generateBroadcasterToken(stream.agoraChannelName!, callerUid);

    // 2. ✅ CREATE TRANSACTION FIRST (Critical Fix)
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

    // 3. ✅ UPDATE STREAM STATE AFTER TRANSACTION SUCCESS
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

    await stream.save(); // <--- Save happens last

    return {
      success: true,
      data: {
        token: callerToken,
        uid: callerUid,
        callerAgoraUid: callerUid,
        hostAgoraUid: stream.hostAgoraUid,
        channelName: stream.agoraChannelName,
        maxDuration: stream.callSettings.maxCallDuration
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

  async cancelCallRequest(streamId: string, userId: string) {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) throw new NotFoundException('Stream not found');

    const index = stream.callWaitlist.findIndex(r => r.userId.toString() === userId && r.status === 'waiting');
    if (index !== -1) {
      stream.callWaitlist.splice(index, 1);
      // Reorder
      stream.callWaitlist.filter(r => r.status === 'waiting').forEach((r, i) => r.position = i + 1);
      await stream.save();
      return { success: true, message: 'Request cancelled' };
    }
    return { success: false, message: 'Request not found' };
  }

  async endCurrentCall(streamId: string, hostId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream || !stream.currentCall?.isOnCall) return { success: true, message: 'No active call' };

    const transaction = await this.callTransactionModel.findOne({
      streamId, userId: stream.currentCall.callerId, status: 'ongoing'
    });

    if (transaction) {
      const endTime = new Date();
      const durationSec = Math.floor((endTime.getTime() - transaction.startedAt.getTime()) / 1000);
      const billedMin = Math.ceil(durationSec / 60); 
      const cost = billedMin * transaction.pricePerMinute;

      if (transaction.startedAt) {
        await this.walletService.deductFromUser(
          transaction.userId.toString(),
          cost,
          'stream_call',
          `Call with Astrologer (${billedMin} mins)`
        );

        await this.walletService.creditToAstrologer(
          transaction.astrologerId.toString(),
          cost, 
          'stream_call',
          `Call earning from User (${billedMin} mins)`
        );

        await this.earningsService.updateEarnings(transaction.astrologerId.toString(), cost, 'call');

        transaction.endedAt = endTime;
        transaction.duration = durationSec;
        transaction.totalCharge = cost;
        transaction.status = 'completed';
        await transaction.save();

        stream.totalCallRevenue += cost;
        stream.totalRevenue += cost;
        stream.totalCalls += 1;
      }
    }

    stream.currentCall = undefined as any;
    stream.currentState = 'streaming';
    await stream.save();

    return { success: true, message: 'Call ended' };
  }
  
  async endUserCall(streamId: string, userId: string) {
     return this.endCurrentCall(streamId, userId);
  }

  // ==================== VIEWER ====================

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

    // 3. Update/Create Viewer Record
    await this.viewerModel.updateOne(
      { streamId, userId },
      { $set: { isActive: true, joinedAt: new Date(), agoraUid: uid } },
      { upsert: true }
    );

    // ✅ FIXED: Use findOneAndUpdate with { streamId } query
    // DO NOT use findByIdAndUpdate here because streamId is a string, not ObjectId
    await this.streamModel.findOneAndUpdate(
      { streamId: streamId }, 
      { $inc: { totalViews: 1, viewerCount: 1 } }
    );

    // Update Stream
    const updatedStream = await this.streamModel.findOneAndUpdate(
      { streamId }, 
      { $inc: { totalViews: 1, viewerCount: 1 } },
      { new: true } // Return updated doc
    );

    // ✅ FIX: Emit event to EVERYONE in the room (including Host)
    if (this.streamGateway && this.streamGateway.server && updatedStream) {
      this.streamGateway.server.to(streamId).emit('viewer_count_updated', {
        count: updatedStream.viewerCount,
        timestamp: new Date()
      });
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
          viewerCount: (stream.viewerCount || 0) + 1
        }
      }
    };
  }

  async leaveStream(streamId: string, userId: string) {
    const viewer = await this.viewerModel.findOne({ streamId, userId, isActive: true });
    if (viewer) {
      viewer.isActive = false;
      const leftAt = new Date();
      const watchTime = Math.floor((leftAt.getTime() - viewer.joinedAt.getTime()) / 1000);
      viewer.watchTime += watchTime;
      await viewer.save();

      const updatedStream = await this.streamModel.findOneAndUpdate(
        { streamId }, 
        { $inc: { viewerCount: -1, totalWatchTime: watchTime } },
        { new: true }
      );

      // ✅ FIX: Emit event to EVERYONE
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
    const streams = await this.streamModel.find({ status: 'live' })
      .populate('hostId', 'name profilePicture')
      .skip((page-1)*limit).limit(limit).lean();
    return { success: true, data: streams };
  }

  // Admin
  async getAllStreamsAdmin(filters: any) {
    return this.streamModel.find(filters).populate('hostId').lean();
  }
  
  async getStreamDetailsAdmin(streamId: string) {
    const stream = await this.streamModel.findOne({ streamId }).populate('hostId').lean();
    const calls = await this.callTransactionModel.find({ streamId });
    return { success: true, data: { stream, calls } };
  }

  async forceEndStreamAdmin(streamId: string, reason: string) {
    const stream = await this.streamModel.findOne({ streamId });
    if (stream) await this.endStream(streamId, stream.hostId.toString());
    return { success: true, message: 'Force ended' };
  }

  // Admin Recording
  async startRecording(streamId: string) {
     const stream = await this.streamModel.findOne({ streamId });
     if (!stream || stream.status !== 'live') throw new BadRequestException('Stream not live');
     if (stream.isRecording) throw new BadRequestException('Already recording');

     const uid = this.streamAgoraService.generateUid().toString();
     const token = this.streamAgoraService.generateBroadcasterToken(stream.agoraChannelName!, parseInt(uid));
     
     const resourceId = await this.streamAgoraService.acquireResource(stream.agoraChannelName!, uid);
     const sid = await this.streamAgoraService.startRecording(resourceId, stream.agoraChannelName!, uid, token);

     stream.isRecording = true;
     stream.recordingResourceId = resourceId;
     stream.recordingSid = sid;
     stream.recordingUid = uid;
     await stream.save();

     return { success: true, message: 'Recording started', data: { sid } };
  }

  async stopRecording(streamId: string) {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream || !stream.isRecording) throw new BadRequestException('Not recording');

    const files = await this.streamAgoraService.stopRecording(
      stream.recordingResourceId!, 
      stream.recordingSid!, 
      stream.agoraChannelName!, 
      stream.recordingUid!
    );

    stream.isRecording = false;
    stream.recordingFiles = files.map((f: any) => f.fileName);
    await stream.save();

    return { success: true, message: 'Recording stopped', data: { files } };
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