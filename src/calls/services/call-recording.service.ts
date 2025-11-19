import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

@Injectable()
export class CallRecordingService {
  private readonly logger = new Logger(CallRecordingService.name);
  private readonly AGORA_APP_ID: string;
  private readonly AGORA_CUSTOMER_ID: string;
  private readonly AGORA_CUSTOMER_SECRET: string;
  private readonly s3Client: S3Client;
  private readonly S3_BUCKET: string;

  // Store active recordings
  private activeRecordings = new Map<string, {
    resourceId: string;
    sid: string;
    uid: number;
  }>();

  constructor(private configService: ConfigService) {
  this.AGORA_APP_ID = this.configService.get<string>('AGORA_APP_ID') || '';
  this.AGORA_CUSTOMER_ID = this.configService.get<string>('AGORA_CUSTOMER_ID') || '';
  this.AGORA_CUSTOMER_SECRET = this.configService.get<string>('AGORA_CUSTOMER_SECRET') || '';
  this.S3_BUCKET = this.configService.get<string>('AWS_S3_BUCKET') || 'your-bucket-name';

  // ✅ Validate required AWS credentials
  const awsAccessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
  const awsSecretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');
  const awsRegion = this.configService.get<string>('AWS_REGION') || 'us-east-1';

  if (!awsAccessKeyId || !awsSecretAccessKey) {
    throw new Error('AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY) are required');
  }

  // ✅ TypeScript now knows these are non-null strings
  this.s3Client = new S3Client({
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    },
  });
}


  /**
   * ✅ STEP 1: Acquire cloud recording resource
   */
  private async acquireResource(channelName: string, uid: number): Promise<string> {
    const url = `https://api.agora.io/v1/apps/${this.AGORA_APP_ID}/cloud_recording/acquire`;

    const response = await axios.post(
      url,
      {
        cname: channelName,
        uid: uid.toString(),
        clientRequest: {
          resourceExpiredHour: 24,
        },
      },
      {
        auth: {
          username: this.AGORA_CUSTOMER_ID,
          password: this.AGORA_CUSTOMER_SECRET,
        },
        headers: { 'Content-Type': 'application/json' },
      }
    );

    this.logger.log(`Acquired resource: ${response.data.resourceId}`);
    return response.data.resourceId;
  }

  /**
   * ✅ STEP 2: Start cloud recording
   */
  async startRecording(
    sessionId: string,
    callType: 'audio' | 'video',
    channelName: string,
    agoraUid: number
  ): Promise<any> {
    try {
      // Step 1: Acquire resource
      const resourceId = await this.acquireResource(channelName, agoraUid);

      // Step 2: Start recording
      const url = `https://api.agora.io/v1/apps/${this.AGORA_APP_ID}/cloud_recording/resourceid/${resourceId}/mode/mix/start`;

      const response = await axios.post(
        url,
        {
          cname: channelName,
          uid: agoraUid.toString(),
          clientRequest: {
            token: '', // Optional: Use if channel has token authentication
            recordingConfig: {
              maxIdleTime: 30, // Stop recording after 30s if channel is idle
              streamTypes: callType === 'video' ? 2 : 0, // 0 = audio only, 2 = audio + video
              channelType: 0, // 0 = communication, 1 = live broadcast
              videoStreamType: 0, // 0 = high stream
              transcodingConfig: callType === 'video' ? {
                width: 640,
                height: 480,
                fps: 15,
                bitrate: 500,
                mixedVideoLayout: 1, // Float layout
              } : undefined,
            },
            storageConfig: {
              vendor: 1, // 1 = Amazon S3, 2 = Alibaba, 3 = Tencent
              region: 0, // Your S3 region code
              bucket: this.S3_BUCKET,
              accessKey: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
              secretKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
              fileNamePrefix: [`recordings/${sessionId}`], // S3 path
            },
          },
        },
        {
          auth: {
            username: this.AGORA_CUSTOMER_ID,
            password: this.AGORA_CUSTOMER_SECRET,
          },
          headers: { 'Content-Type': 'application/json' },
        }
      );

      const sid = response.data.sid;

      // Store recording info
      this.activeRecordings.set(sessionId, {
        resourceId,
        sid,
        uid: agoraUid,
      });

      this.logger.log(`✅ Recording started: ${sessionId} | SID: ${sid}`);

      return {
        success: true,
        recordingId: sid,
        resourceId,
        message: 'Recording started',
      };
    } catch (error: any) {
      this.logger.error(`Recording start failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ STEP 3: Stop cloud recording
   */
  async stopRecording(sessionId: string, channelName: string): Promise<any> {
    try {
      const recordingInfo = this.activeRecordings.get(sessionId);

      if (!recordingInfo) {
        this.logger.warn(`No active recording for session: ${sessionId}`);
        return {
          success: false,
          message: 'No active recording found',
        };
      }

      const { resourceId, sid, uid } = recordingInfo;

      // Stop recording
      const url = `https://api.agora.io/v1/apps/${this.AGORA_APP_ID}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/mix/stop`;

      const response = await axios.post(
        url,
        {
          cname: channelName,
          uid: uid.toString(),
          clientRequest: {},
        },
        {
          auth: {
            username: this.AGORA_CUSTOMER_ID,
            password: this.AGORA_CUSTOMER_SECRET,
          },
          headers: { 'Content-Type': 'application/json' },
        }
      );

      // Get file info from Agora response
      const fileList = response.data.serverResponse?.fileList || [];
      const recordingFile = fileList[0];

      if (!recordingFile) {
        throw new Error('No recording file returned from Agora');
      }

      // ✅ File is already in YOUR S3 bucket (Agora uploaded it directly!)
      const s3Key = `recordings/${sessionId}/${recordingFile.fileName}`;
      const recordingUrl = `https://${this.S3_BUCKET}.s3.amazonaws.com/${s3Key}`;

      // Clean up
      this.activeRecordings.delete(sessionId);

      this.logger.log(`✅ Recording stopped: ${sessionId} | URL: ${recordingUrl}`);

      return {
        success: true,
        recordingUrl,
        recordingS3Key: s3Key,
        recordingDuration: Math.floor(recordingFile.sliceStartTime / 1000), // Convert ms to seconds
        fileSize: recordingFile.size,
        message: 'Recording saved',
      };
    } catch (error: any) {
      this.logger.error(`Recording stop failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * ✅ STEP 4: Delete recording from S3 (Migrated to v3)
   */
  async deleteRecording(recordingS3Key: string): Promise<any> {
    try {
      // ✅ v3 way - Use DeleteObjectCommand
      const command = new DeleteObjectCommand({
        Bucket: this.S3_BUCKET,
        Key: recordingS3Key,
      });

      await this.s3Client.send(command);

      this.logger.log(`Recording deleted: ${recordingS3Key}`);

      return {
        success: true,
        message: 'Recording deleted',
      };
    } catch (error: any) {
      this.logger.error(`Recording deletion failed: ${error.message}`);
      throw error;
    }
  }
}
