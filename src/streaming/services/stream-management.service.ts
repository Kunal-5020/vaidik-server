import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LiveStream, LiveStreamDocument } from '../schemas/live-stream.schema';
import { StreamViewer, StreamViewerDocument } from '../schemas/stream-viewer.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { AgoraService } from '../../calls/services/agora.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StreamManagementService {
  private readonly logger = new Logger(StreamManagementService.name);

  constructor(
    @InjectModel(LiveStream.name) private liveStreamModel: Model<LiveStreamDocument>,
    @InjectModel(StreamViewer.name) private streamViewerModel: Model<StreamViewerDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private agoraService: AgoraService,
  ) {}

  // Create a new live stream
  async createStream(astrologerId: string, createStreamDto: any): Promise<any> {
    // Validate astrologer
    const astrologer = await this.astrologerModel.findById(astrologerId);
    if (!astrologer) {
      throw new NotFoundException('Astrologer not found');
    }

    if (astrologer.accountStatus !== 'active') {
      throw new BadRequestException('Astrologer account is not active');
    }

    // Check if astrologer already has an active/scheduled stream
    const existingStream = await this.liveStreamModel.findOne({
      astrologerId: new Types.ObjectId(astrologerId),
      status: { $in: ['scheduled', 'live'] }
    });

    if (existingStream) {
      throw new BadRequestException('You already have an active or scheduled stream');
    }

    try {
      // Generate unique identifiers
      const streamId = uuidv4();
      const channelName = `stream_${astrologerId}_${Date.now()}`;

      // Create live stream document
      const liveStream = new this.liveStreamModel({
        astrologerId: new Types.ObjectId(astrologerId),
        streamId,
        channelName,
        title: createStreamDto.title,
        description: createStreamDto.description,
        scheduledAt: new Date(createStreamDto.scheduledAt),
        tags: createStreamDto.tags || [],
        category: createStreamDto.category || 'general',
        isPaid: createStreamDto.isPaid || false,
        entryFee: createStreamDto.entryFee || 0,
        thumbnailUrl: createStreamDto.thumbnailUrl,
        settings: {
          allowChat: createStreamDto.allowChat !== false,
          allowTips: createStreamDto.allowTips !== false,
          allowQuestions: createStreamDto.allowQuestions !== false,
          moderationEnabled: false
        },
        status: 'scheduled'
      });

      await liveStream.save();

      this.logger.log(`📺 Stream scheduled: ${streamId} by astrologer ${astrologerId}`);

      return {
        success: true,
        message: 'Live stream scheduled successfully',
        data: {
          streamId,
          channelName,
          title: liveStream.title,
          scheduledAt: liveStream.scheduledAt,
          status: 'scheduled'
        }
      };

    } catch (error) {
      this.logger.error(`❌ Stream creation failed: ${error.message}`);
      throw new BadRequestException('Failed to create live stream');
    }
  }

  // Start a scheduled live stream
  async startStream(astrologerId: string, streamId: string): Promise<any> {
    const stream = await this.liveStreamModel.findOne({ 
      streamId, 
      astrologerId: new Types.ObjectId(astrologerId) 
    });

    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status !== 'scheduled') {
      throw new BadRequestException('Only scheduled streams can be started');
    }

    try {
      // Generate Agora token for host
      const hostToken = this.agoraService.generateRtcToken(
        stream.channelName,
        this.agoraService['generateUidFromUserId'](astrologerId),
        'publisher'
      );

      // Update stream status
      stream.status = 'live';
      stream.startedAt = new Date();
      await stream.save();

      this.logger.log(`🔴 Stream started: ${streamId}`);

      return {
        success: true,
        message: 'Live stream started successfully',
        data: {
          streamId,
          channelName: stream.channelName,
          hostToken: hostToken.token,
          hostUid: hostToken.uid,
          appId: hostToken.appId,
          status: 'live'
        }
      };

    } catch (error) {
      this.logger.error(`❌ Stream start failed: ${error.message}`);
      throw new BadRequestException('Failed to start live stream');
    }
  }

  // Join a live stream as viewer
  async joinStreamAsViewer(userId: string, streamId: string): Promise<any> {
    const stream = await this.liveStreamModel
      .findOne({ streamId })
      .populate('astrologerId', 'name profileImage');

    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status !== 'live') {
      throw new BadRequestException('Stream is not currently live');
    }

    // Check if it's a paid stream
    if (stream.isPaid && stream.entryFee > 0) {
      const user = await this.userModel.findById(userId);
      if (!user || user.wallet.balance < stream.entryFee) {
        throw new BadRequestException('Insufficient balance to join paid stream');
      }

      // Deduct entry fee
      user.wallet.balance -= stream.entryFee;
      user.wallet.totalSpent += stream.entryFee;
      await user.save();
    }

    try {
      // Generate viewer token
      const viewerToken = this.agoraService.generateRtcToken(
        stream.channelName,
        this.agoraService['generateUidFromUserId'](userId),
        'subscriber'
      );

      // Get user info
      const user = await this.userModel.findById(userId).select('name profileImage');

      // Create or update viewer record
      const existingViewer = await this.streamViewerModel.findOne({ streamId, userId });

      if (existingViewer) {
        existingViewer.isActive = true;
        existingViewer.lastActivity = new Date();
        await existingViewer.save();
      } else {
        const newViewer = new this.streamViewerModel({
          streamId,
          userId: new Types.ObjectId(userId),
          userName: user?.name || 'Anonymous',
          profileImage: user?.profileImage,
          joinedAt: new Date(),
          isActive: true,
          lastActivity: new Date()
        });
        await newViewer.save();

        // Increment total viewers
        stream.totalViewers += 1;
      }

      // Update current viewers count
      const currentViewers = await this.streamViewerModel.countDocuments({
        streamId,
        isActive: true
      });

      stream.currentViewers = currentViewers;
      if (currentViewers > stream.maxViewers) {
        stream.maxViewers = currentViewers;
      }

      await stream.save();

      this.logger.log(`👁️ User ${userId} joined stream: ${streamId}`);

      return {
        success: true,
        message: 'Joined live stream successfully',
        data: {
          streamId,
          channelName: stream.channelName,
          viewerToken: viewerToken.token,
          viewerUid: viewerToken.uid,
          appId: viewerToken.appId,
          streamInfo: {
            title: stream.title,
            description: stream.description,
            astrologerName: (stream.astrologerId as any).name,
            currentViewers: stream.currentViewers,
            settings: stream.settings
          }
        }
      };

    } catch (error) {
      this.logger.error(`❌ Join stream failed: ${error.message}`);
      throw new BadRequestException('Failed to join live stream');
    }
  }

  // Leave a live stream
  async leaveStream(userId: string, streamId: string): Promise<any> {
    const viewer = await this.streamViewerModel.findOne({ streamId, userId });

    if (viewer && viewer.isActive) {
      viewer.isActive = false;
      viewer.leftAt = new Date();
      
      // Calculate watch duration
      if (viewer.joinedAt) {
        const watchDuration = Math.floor((viewer.leftAt.getTime() - viewer.joinedAt.getTime()) / 1000);
        viewer.watchDuration = watchDuration;
      }

      await viewer.save();

      // Update current viewers count
      const stream = await this.liveStreamModel.findOne({ streamId });
      if (stream) {
        const currentViewers = await this.streamViewerModel.countDocuments({
          streamId,
          isActive: true
        });
        stream.currentViewers = currentViewers;
        await stream.save();
      }

      this.logger.log(`👋 User ${userId} left stream: ${streamId}`);
    }

    return {
      success: true,
      message: 'Left stream successfully'
    };
  }

  // End a live stream
  async endStream(astrologerId: string, streamId: string): Promise<any> {
    const stream = await this.liveStreamModel.findOne({ 
      streamId, 
      astrologerId: new Types.ObjectId(astrologerId) 
    });

    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status !== 'live') {
      throw new BadRequestException('Stream is not currently live');
    }

    try {
      // Update stream status
      stream.status = 'ended';
      stream.endedAt = new Date();
      
      if (stream.startedAt) {
        const durationMs = stream.endedAt.getTime() - stream.startedAt.getTime();
        stream.duration = Math.floor(durationMs / 1000);
      }

      await stream.save();

      // Mark all active viewers as inactive
      await this.streamViewerModel.updateMany(
        { streamId, isActive: true },
        { 
          isActive: false, 
          leftAt: new Date()
        }
      );

      this.logger.log(`⏹️ Stream ended: ${streamId}, Duration: ${stream.duration}s`);

      return {
        success: true,
        message: 'Live stream ended successfully',
        data: {
          streamId,
          duration: stream.duration,
          totalViewers: stream.totalViewers,
          maxViewers: stream.maxViewers,
          totalTips: stream.totalTips,
          totalMessages: stream.totalMessages
        }
      };

    } catch (error) {
      this.logger.error(`❌ Stream end failed: ${error.message}`);
      throw new BadRequestException('Failed to end live stream');
    }
  }

  // Get live streams list
  async getLiveStreams(
    page: number = 1, 
    limit: number = 10, 
    category?: string
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = { status: 'live' };

    if (category) {
      query.category = category;
    }

    const streams = await this.liveStreamModel
      .find(query)
      .populate('astrologerId', 'name profileImage experienceYears specializations')
      .sort({ currentViewers: -1, startedAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalStreams = await this.liveStreamModel.countDocuments(query);

    return {
      success: true,
      data: {
        streams,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalStreams / limit),
          totalStreams,
          hasNextPage: page < Math.ceil(totalStreams / limit),
          hasPrevPage: page > 1
        }
      }
    };
  }

  // Get stream details
  async getStreamDetails(streamId: string): Promise<any> {
    const stream = await this.liveStreamModel
      .findOne({ streamId })
      .populate('astrologerId', 'name profileImage experienceYears specializations stats');

    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    return {
      success: true,
      data: stream
    };
  }

  // Send tip to stream
  async sendTip(userId: string, streamId: string, amount: number, message?: string): Promise<any> {
    const stream = await this.liveStreamModel.findOne({ streamId });
    
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status !== 'live') {
      throw new BadRequestException('Stream is not currently live');
    }

    if (!stream.settings.allowTips) {
      throw new BadRequestException('Tips are not allowed for this stream');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.wallet.balance < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    try {
      // Deduct from user wallet
      user.wallet.balance -= amount;
      user.wallet.totalSpent += amount;
      await user.save();

      // Add tip to stream
      stream.tips.push({
        userId: new Types.ObjectId(userId),
        amount,
        message: message || '',
        createdAt: new Date()
      } as any);

      stream.totalTips += amount;
      await stream.save();

      this.logger.log(`💰 Tip sent: ₹${amount} from ${userId} to stream ${streamId}`);

      return {
        success: true,
        message: 'Tip sent successfully',
        data: {
          amount,
          message,
          totalTips: stream.totalTips
        }
      };

    } catch (error) {
      this.logger.error(`❌ Send tip failed: ${error.message}`);
      throw new BadRequestException('Failed to send tip');
    }
  }

  // Get astrologer's streams
  async getAstrologerStreams(astrologerId: string, status?: string): Promise<any> {
    const query: any = { astrologerId: new Types.ObjectId(astrologerId) };
    
    if (status) {
      query.status = status;
    }

    const streams = await this.liveStreamModel
      .find(query)
      .sort({ createdAt: -1 });

    return {
      success: true,
      data: streams
    };
  }

  // Get stream analytics
  async getStreamAnalytics(astrologerId: string, streamId: string): Promise<any> {
    const stream = await this.liveStreamModel.findOne({ 
      streamId, 
      astrologerId: new Types.ObjectId(astrologerId) 
    });

    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    const viewers = await this.streamViewerModel.find({ streamId });
    
    const analytics = {
      streamInfo: {
        title: stream.title,
        duration: stream.duration,
        status: stream.status
      },
      viewerMetrics: {
        totalViewers: stream.totalViewers,
        maxConcurrentViewers: stream.maxViewers,
        averageWatchTime: viewers.length > 0 
          ? Math.floor(viewers.reduce((sum, v) => sum + (v.watchDuration || 0), 0) / viewers.length)
          : 0
      },
      engagement: {
        totalMessages: stream.totalMessages,
        totalTips: stream.totalTips,
        tipsCount: stream.tips.length,
        averageTip: stream.tips.length > 0 
          ? Math.floor(stream.totalTips / stream.tips.length) 
          : 0
      },
      revenue: {
        totalTips: stream.totalTips,
        entryFees: stream.isPaid ? stream.totalViewers * stream.entryFee : 0,
        totalRevenue: stream.totalTips + (stream.isPaid ? stream.totalViewers * stream.entryFee : 0)
      }
    };

    return {
      success: true,
      data: analytics
    };
  }

  async getStreamViewerCount(streamId: string): Promise<number> {
  try {
    const count = await this.streamViewerModel.countDocuments({
      streamId,
      isActive: true
    });
    return count;
  } catch (error) {
    this.logger.error(`Error getting stream viewer count: ${error.message}`);
    return 0;
  }
}
}
