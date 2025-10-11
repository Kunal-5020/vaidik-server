import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StreamSession, StreamSessionDocument } from '../schemas/stream-session.schema';
import { StreamViewer, StreamViewerDocument } from '../schemas/stream-viewer.schema';
import { StreamAgoraService } from './stream-agora.service';

@Injectable()
export class StreamSessionService {
  constructor(
    @InjectModel(StreamSession.name) private streamModel: Model<StreamSessionDocument>,
    @InjectModel(StreamViewer.name) private viewerModel: Model<StreamViewerDocument>,
    private streamAgoraService: StreamAgoraService,
  ) {}

  // Create stream
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

  // Start stream (go live)
  async startStream(streamId: string, hostId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId, hostId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status !== 'scheduled') {
      throw new BadRequestException('Stream already started or ended');
    }

    stream.status = 'live';
    stream.startedAt = new Date();
    await stream.save();

    return {
      success: true,
      message: 'Stream is now live',
      data: stream
    };
  }

  // End stream
  async endStream(streamId: string, hostId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId, hostId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status !== 'live') {
      throw new BadRequestException('Stream is not live');
    }

    const endTime = new Date();
    const duration = stream.startedAt 
      ? Math.floor((endTime.getTime() - stream.startedAt.getTime()) / 1000)
      : 0;

    stream.status = 'ended';
    stream.endedAt = endTime;
    stream.duration = duration;

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
      message: 'Stream ended',
      data: {
        streamId: stream.streamId,
        duration: stream.duration,
        totalViews: stream.totalViews,
        peakViewers: stream.peakViewers,
        totalRevenue: stream.totalRevenue
      }
    };
  }

  // Join stream (viewer)
  async joinStream(streamId: string, userId: string): Promise<any> {
    const stream = await this.streamModel.findOne({ streamId });
    if (!stream) {
      throw new NotFoundException('Stream not found');
    }

    if (stream.status !== 'live') {
      throw new BadRequestException('Stream is not live');
    }

    // Check if paid stream and user has paid
    if (stream.streamType === 'paid' && stream.entryFee > 0) {
      // TODO: Check payment from wallet
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
      
      // Increment total views
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
        hostName: stream.hostId
      }
    };
  }

  // Leave stream
  async leaveStream(streamId: string, userId: string): Promise<void> {
    const viewer = await this.viewerModel.findOne({ streamId, userId, isActive: true });
    if (!viewer) return;

    viewer.isActive = false;
    viewer.leftAt = new Date();

    // Calculate watch time
    const watchTime = Math.floor((viewer.leftAt.getTime() - viewer.joinedAt.getTime()) / 1000);
    viewer.watchTime += watchTime;

    await viewer.save();

    // Update stream viewer count
    const stream = await this.streamModel.findOne({ streamId });
    if (stream) {
      stream.viewerCount = await this.viewerModel.countDocuments({ streamId, isActive: true });
      stream.totalWatchTime += watchTime;
      await stream.save();
    }
  }

  // Get live streams
  async getLiveStreams(page: number = 1, limit: number = 20): Promise<any> {
    const skip = (page - 1) * limit;

    const [streams, total] = await Promise.all([
      this.streamModel
        .find({ status: 'live' })
        .populate('hostId', 'name profilePicture experienceYears specializations')
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

  // Get scheduled streams
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

  // Get stream details
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

  // Update stream analytics
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
}
