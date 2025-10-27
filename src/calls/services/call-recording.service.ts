// src/calls/services/call-recording.service.ts

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { CallSession, CallSessionDocument } from '../schemas/call-session.schema';

@Injectable()
export class CallRecordingService {
  private readonly logger = new Logger(CallRecordingService.name);
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

  private getAuthHeader(): string {
    const auth = Buffer.from(`${this.customerId}:${this.customerSecret}`).toString('base64');
    return `Basic ${auth}`;
  }

  // ✅ ENHANCED: Start recording with proper file naming
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
            scene: 0
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

      // ✅ Determine file format based on call type
      const fileType = session.callType === 'audio' ? ['hls'] : ['hls', 'mp4'];
      const filePrefix = session.callType === 'audio' ? 'voice_notes' : 'video_calls';

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
              streamTypes: session.callType === 'audio' ? 0 : 2, // 0=audio only, 2=audio+video
              channelType: 0,
              videoStreamType: 0,
              subscribeAudioUids: ['#allstream#'],
              subscribeVideoUids: session.callType === 'video' ? ['#allstream#'] : []
            },
            recordingFileConfig: {
              avFileType: fileType
            },
            storageConfig: {
              vendor: 1, // AWS S3
              region: this.configService.get<string>('AWS_S3_REGION') || 'ap-south-1',
              bucket: this.configService.get<string>('AWS_S3_BUCKET') || '',
              accessKey: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
              secretKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
              fileNamePrefix: [`recordings/${filePrefix}/${sessionId}`]
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

      // Update session
      session.isRecorded = true;
      session.agoraResourceId = resourceId;
      session.agoraSid = sid;
      session.recordingStartedAt = new Date();
      await session.save();

      this.logger.log(`Recording started: ${sessionId} | Type: ${session.callType} | SID: ${sid}`);

      return {
        success: true,
        message: 'Recording started successfully',
        resourceId,
        sid
      };
    } catch (error: any) {
      this.logger.error(`Recording start error: ${error.response?.data || error.message}`);
      throw new BadRequestException(`Failed to start recording: ${error.message}`);
    }
  }

  // ✅ ENHANCED: Stop recording and return S3 details
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
      const fileList = serverResponse.fileList || [];
      
      // Get the recording file details
      const recordingFile = fileList.find((f: any) => f.fileName.endsWith('.m3u8') || f.fileName.endsWith('.mp4'));
      const fileName = recordingFile?.fileName || '';

      // ✅ Construct S3 URL
      const bucket = this.configService.get<string>('AWS_S3_BUCKET');
      const region = this.configService.get<string>('AWS_S3_REGION');
      const filePrefix = session.callType === 'audio' ? 'voice_notes' : 'video_calls';
      const s3Key = `recordings/${filePrefix}/${sessionId}/${fileName}`;
      const recordingUrl = `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;

      // Update session
      session.recordingStoppedAt = new Date();
      session.recordingUrl = recordingUrl;
      session.recordingS3Key = s3Key;
      session.recordingDuration = session.duration;
      await session.save();

      this.logger.log(`Recording stopped: ${sessionId} | URL: ${recordingUrl}`);

      return {
        success: true,
        message: 'Recording stopped successfully',
        recordingUrl,
        recordingS3Key: s3Key
      };
    } catch (error: any) {
      this.logger.error(`Recording stop error: ${error.response?.data || error.message}`);
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
