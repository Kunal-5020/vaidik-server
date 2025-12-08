import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';
import { StreamSession, StreamSessionDocument } from '../schemas/stream-session.schema';

@Injectable()
export class StreamAgoraService {
  private readonly logger = new Logger(StreamAgoraService.name);
  private appId: string;
  private appCertificate: string;
  private customerId: string;
  private customerSecret: string;
  private storageConfig: any;

  constructor(
    private configService: ConfigService,
    @InjectModel(StreamSession.name) private streamModel: Model<StreamSessionDocument>,
  ) {
    this.appId = this.configService.get<string>('AGORA_APP_ID') || '';
    this.appCertificate = this.configService.get<string>('AGORA_APP_CERTIFICATE') || '';
    this.customerId = this.configService.get<string>('AGORA_CUSTOMER_ID') || '';
    this.customerSecret = this.configService.get<string>('AGORA_CUSTOMER_SECRET') || '';
    
    // Configure your S3/Storage bucket here or via env
    this.storageConfig = {
      vendor: parseInt(this.configService.get('AGORA_STORAGE_VENDOR') || '1'), // 1 = AWS
      region: parseInt(this.configService.get('AGORA_STORAGE_REGION') || '0'),
      bucket: this.configService.get('AGORA_STORAGE_BUCKET'),
      accessKey: this.configService.get('AGORA_STORAGE_ACCESS_KEY'),
      secretKey: this.configService.get('AGORA_STORAGE_SECRET_KEY'),
      fileNamePrefix: ['recordings']
    };
  }

  // ... [Existing Token Generation Methods: generateBroadcasterToken, generateViewerToken, generateUid] ...
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
  
  generateChannelName(): string {
    return `stream_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  generateUid(): number {
    return Math.floor(Math.random() * 1000000) + 1;
  }

  getAppId(): string {
    return this.appId;
  }
    
  async generateViewerTokenByStreamId(streamId: string) {
     const stream = await this.streamModel.findOne({ streamId }).populate('hostId', 'name').lean();
     if (!stream || !stream.agoraChannelName) throw new NotFoundException('Stream not found');
     const uid = this.generateUid();
     const token = this.generateViewerToken(stream.agoraChannelName, uid);
     return { success: true, data: { token, channelName: stream.agoraChannelName, uid, appId: this.appId }};
  }


  // ==================== CLOUD RECORDING ====================

  private getAuthHeader() {
    const plain = `${this.customerId}:${this.customerSecret}`;
    return `Basic ${Buffer.from(plain).toString('base64')}`;
  }

  async acquireResource(channelName: string, uid: string) {
    try {
      const response = await fetch(`https://api.agora.io/v1/apps/${this.appId}/cloud_recording/acquire`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cname: channelName,
          uid: uid,
          clientRequest: { resourceExpiredHour: 24 }
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to acquire resource');
      return data.resourceId;
    } catch (error) {
      this.logger.error('Acquire resource failed', error);
      throw error;
    }
  }

  async startRecording(resourceId: string, channelName: string, uid: string, token: string) {
    try {
      const response = await fetch(`https://api.agora.io/v1/apps/${this.appId}/cloud_recording/resourceid/${resourceId}/mode/mix/start`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cname: channelName,
          uid: uid,
          clientRequest: {
            token: token,
            recordingConfig: {
              maxIdleTime: 30,
              streamTypes: 2, // Audio + Video
              channelType: 1, // Live broadcasting
              transcodingConfig: {
                height: 640,
                width: 360,
                bitrate: 500,
                fps: 15,
                mixedVideoLayout: 1,
                backgroundColor: "#000000"
              }
            },
            storageConfig: this.storageConfig
          }
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to start recording');
      return data.sid; // Recording ID
    } catch (error) {
      this.logger.error('Start recording failed', error);
      throw error;
    }
  }

  async stopRecording(resourceId: string, sid: string, channelName: string, uid: string) {
    try {
      const response = await fetch(`https://api.agora.io/v1/apps/${this.appId}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/mix/stop`, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cname: channelName,
          uid: uid,
          clientRequest: {}
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Failed to stop recording');
      return data.serverResponse?.fileList;
    } catch (error) {
      this.logger.error('Stop recording failed', error);
      throw error;
    }
  }
}