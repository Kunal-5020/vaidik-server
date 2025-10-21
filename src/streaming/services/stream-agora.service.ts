import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';
import { StreamSession, StreamSessionDocument } from '../schemas/stream-session.schema';

@Injectable()
export class StreamAgoraService {
  private appId: string;
  private appCertificate: string;

  constructor(
    private configService: ConfigService,
    @InjectModel(StreamSession.name) private streamModel: Model<StreamSessionDocument>,
  ) {
    this.appId = this.configService.get<string>('AGORA_APP_ID') || '';
    this.appCertificate = this.configService.get<string>('AGORA_APP_CERTIFICATE') || '';
  }

  // Generate token for broadcaster (astrologer)
  generateBroadcasterToken(channelName: string, uid: number): string {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + 7200; // 2 hours

    return RtcTokenBuilder.buildTokenWithUid(
      this.appId,
      this.appCertificate,
      channelName,
      uid,
      RtcRole.PUBLISHER,
      privilegeExpiredTs
    );
  }

  // Generate token for viewer
  generateViewerToken(channelName: string, uid: number): string {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + 3600; // 1 hour

    return RtcTokenBuilder.buildTokenWithUid(
      this.appId,
      this.appCertificate,
      channelName,
      uid,
      RtcRole.SUBSCRIBER,
      privilegeExpiredTs
    );
  }

  /**
   * Generate viewer token for admin by streamId
   */
  async generateViewerTokenByStreamId(streamId: string) {
    try {
      // ✅ FIX: Populate hostId to get astrologer details
      const stream = await this.streamModel
        .findOne({ streamId })
        .populate('hostId', 'name email profilePicture') // ✅ Populate host
        .lean();

      if (!stream) {
        throw new NotFoundException('Stream not found');
      }

      if (stream.status !== 'live') {
        throw new BadRequestException('Stream is not live');
      }

      // ✅ FIX: Check if channel name exists
      if (!stream.agoraChannelName) {
        throw new BadRequestException('Stream channel not configured');
      }

      // Generate a unique viewer UID for admin
      const viewerUid = this.generateUid();

      // Generate token with audience role
      const token = this.generateViewerToken(stream.agoraChannelName, viewerUid);

      // ✅ FIX: Type assertion for populated hostId
      const hostData = stream.hostId as any;

      return {
        success: true,
        data: {
          appId: this.appId,
          channelName: stream.agoraChannelName,
          token,
          uid: viewerUid,
          streamId: stream.streamId,
          title: stream.title,
          hostName: hostData?.name || 'Unknown', // ✅ Fixed
        },
      };
    } catch (error) {
      throw error;
    }
  }

  generateChannelName(): string {
    return `stream_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  generateUid(): number {
    return Math.floor(Math.random() * 1000000) + 1;
  }

  getAppId(): string {
    return this.appId;
  }
}
