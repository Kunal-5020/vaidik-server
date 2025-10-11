import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { CallSession, CallSessionDocument } from '../schemas/call-session.schema';

@Injectable()
export class CallRecordingService {
  private appId: string;
  private customerId: string;
  private customerSecret: string;
  private baseUrl: string = 'https://api.agora.io/v1/apps';

  constructor(
    @InjectModel(CallSession.name) private sessionModel: Model<CallSessionDocument>,
    private configService: ConfigService,
  ) {
    this.appId = this.configService.get<string>('AGORA_APP_ID') || '';
    this.customerId = this.configService.get<string>('AGORA_CUSTOMER_ID') || '';
    this.customerSecret = this.configService.get<string>('AGORA_CUSTOMER_SECRET') || '';
  }

  // Get authorization header for Agora Cloud Recording API
  private getAuthHeader(): string {
    const auth = Buffer.from(`${this.customerId}:${this.customerSecret}`).toString('base64');
    return `Basic ${auth}`;
  }

  // Start cloud recording
  async startRecording(sessionId: string, channelName: string, uid: number): Promise<any> {
    try {
      const session = await this.sessionModel.findOne({ sessionId });
      if (!session) {
        throw new BadRequestException('Session not found');
      }

      // Step 1: Acquire resource
      const acquireUrl = `${this.baseUrl}/${this.appId}/cloud_recording/acquire`;
      const acquireResponse = await axios.post(
        acquireUrl,
        {
          cname: channelName,
          uid: uid.toString(),
          clientRequest: {
            resourceExpiredHour: 24,
            scene: 0 // Real-time recording
          }
        },
        {
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json'
          }
        }
      );

      const resourceId = acquireResponse.data.resourceId;

      // Step 2: Start recording
      const startUrl = `${this.baseUrl}/${this.appId}/cloud_recording/resourceid/${resourceId}/mode/mix/start`;
      const startResponse = await axios.post(
        startUrl,
        {
          cname: channelName,
          uid: uid.toString(),
          clientRequest: {
            token: session.agoraToken,
            recordingConfig: {
              maxIdleTime: 30,
              streamTypes: 2, // Audio and video
              channelType: 0, // Communication mode
              videoStreamType: 0,
              subscribeAudioUids: ['#allstream#'],
              subscribeVideoUids: ['#allstream#']
            },
            recordingFileConfig: {
              avFileType: ['hls', 'mp4']
            },
            storageConfig: {
              vendor: 1, // AWS S3
              region: this.configService.get<string>('AWS_S3_REGION') || 'ap-south-1',
              bucket: this.configService.get<string>('AWS_S3_BUCKET') || '',
              accessKey: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
              secretKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
              fileNamePrefix: [`recordings/${sessionId}`]
            }
          }
        },
        {
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json'
          }
        }
      );

      const sid = startResponse.data.sid;

      // Update session with recording details
      session.isRecorded = true;
      session.agoraResourceId = resourceId;
      session.agoraSid = sid;
      session.recordingStartedAt = new Date();
      await session.save();

      return {
        success: true,
        message: 'Recording started successfully',
        resourceId,
        sid
      };
    } catch (error: any) {
      console.error('Recording start error:', error.response?.data || error.message);
      throw new BadRequestException(`Failed to start recording: ${error.message}`);
    }
  }

  // Stop cloud recording
  async stopRecording(sessionId: string): Promise<any> {
    try {
      const session = await this.sessionModel.findOne({ sessionId });
      if (!session || !session.agoraResourceId || !session.agoraSid) {
        throw new BadRequestException('Recording not found');
      }

      const stopUrl = `${this.baseUrl}/${this.appId}/cloud_recording/resourceid/${session.agoraResourceId}/sid/${session.agoraSid}/mode/mix/stop`;
      const stopResponse = await axios.post(
        stopUrl,
        {
          cname: session.agoraChannelName,
          uid: session.agoraUid?.toString(),
          clientRequest: {}
        },
        {
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json'
          }
        }
      );

      const serverResponse = stopResponse.data.serverResponse;
      const recordingUrl = serverResponse.fileList?.[0]?.fileName || '';

      // Update session
      session.recordingStoppedAt = new Date();
      session.recordingUrl = recordingUrl;
      session.recordingDuration = session.duration;
      await session.save();

      return {
        success: true,
        message: 'Recording stopped successfully',
        recordingUrl
      };
    } catch (error: any) {
      console.error('Recording stop error:', error.response?.data || error.message);
      throw new BadRequestException(`Failed to stop recording: ${error.message}`);
    }
  }

  // Query recording status
  async queryRecording(sessionId: string): Promise<any> {
    try {
      const session = await this.sessionModel.findOne({ sessionId });
      if (!session || !session.agoraResourceId || !session.agoraSid) {
        throw new BadRequestException('Recording not found');
      }

      const queryUrl = `${this.baseUrl}/${this.appId}/cloud_recording/resourceid/${session.agoraResourceId}/sid/${session.agoraSid}/mode/mix/query`;
      const queryResponse = await axios.get(queryUrl, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        data: queryResponse.data
      };
    } catch (error: any) {
      throw new BadRequestException(`Failed to query recording: ${error.message}`);
    }
  }
}
