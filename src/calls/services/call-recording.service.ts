import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { AgoraService } from './agora.service';

const AGORA_REGION_MAPPING: Record<string, number> = {
  'us-east-1': 0, 'us-east-2': 1, 'us-west-1': 2, 'us-west-2': 3,
  'eu-west-1': 4, 'eu-west-2': 5, 'eu-west-3': 6, 'eu-central-1': 7,
  'ap-southeast-1': 8, 'ap-southeast-2': 9, 'ap-northeast-1': 10, 'ap-northeast-2': 11,
  'sa-east-1': 12, 'ca-central-1': 13, 'ap-south-1': 14, 'cn-north-1': 15,
  'cn-northwest-1': 16, 'us-gov-west-1': 17,
};

@Injectable()
export class CallRecordingService {
  private readonly logger = new Logger(CallRecordingService.name);
  private readonly AGORA_APP_ID: string;
  private readonly AGORA_CUSTOMER_ID: string;
  private readonly AGORA_CUSTOMER_SECRET: string;
  private readonly s3Client: S3Client;
  private readonly S3_BUCKET: string;
  private readonly S3_REGION_CODE: number;

  private activeRecordings = new Map<string, {
    resourceId: string;
    sid: string;
    uid: number;
  }>();

  constructor(
    private configService: ConfigService,
    private agoraService: AgoraService
  ) {
    this.AGORA_APP_ID = (this.configService.get<string>('AGORA_APP_ID') || '').trim();
    this.AGORA_CUSTOMER_ID = (this.configService.get<string>('AGORA_CUSTOMER_ID') || '').trim();
    this.AGORA_CUSTOMER_SECRET = (this.configService.get<string>('AGORA_CUSTOMER_SECRET') || '').trim();
    this.S3_BUCKET = (this.configService.get<string>('AWS_S3_BUCKET') || '').trim();

    const awsAccessKeyId = (this.configService.get<string>('AWS_ACCESS_KEY_ID') || '').trim();
    const awsSecretAccessKey = (this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '').trim();
    const awsRegion = (this.configService.get<string>('AWS_REGION') || 'ap-south-1').trim();

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      throw new Error('AWS credentials are required');
    }

    this.S3_REGION_CODE = AGORA_REGION_MAPPING[awsRegion] ?? 0;

    this.s3Client = new S3Client({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    });
  }

  private async acquireResource(channelName: string, uid: number): Promise<string> {
    const url = `https://api.agora.io/v1/apps/${this.AGORA_APP_ID}/cloud_recording/acquire`;
    try {
      const response = await axios.post(url, {
        cname: channelName,
        uid: uid.toString(),
        clientRequest: { resourceExpiredHour: 24 },
      }, {
        auth: { username: this.AGORA_CUSTOMER_ID, password: this.AGORA_CUSTOMER_SECRET },
        headers: { 'Content-Type': 'application/json' },
      });
      return response.data.resourceId;
    } catch (error: any) {
      this.logger.error(`Acquire failed: ${error.response?.data?.message || error.message}`);
      throw error;
    }
  }

  async startRecording(sessionId: string, callType: 'audio' | 'video', channelName: string, agoraUid: number): Promise<any> {
    try {
      const resourceId = await this.acquireResource(channelName, agoraUid);
      const recordingToken = this.agoraService.generateRtcToken(channelName, agoraUid, 'publisher');
      
      // ✅ Sanitize ID for S3 Path
      const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9]/g, '');

      const transcodingConfig = {
        width: 360, height: 640, fps: 15, bitrate: 500,
        mixedVideoLayout: 1, backgroundColor: '#000000',
      };

      const url = `https://api.agora.io/v1/apps/${this.AGORA_APP_ID}/cloud_recording/resourceid/${resourceId}/mode/mix/start`;

      const response = await axios.post(url, {
        cname: channelName,
        uid: agoraUid.toString(),
        clientRequest: {
          token: recordingToken,
          recordingConfig: {
            maxIdleTime: 30,
            streamTypes: callType === 'video' ? 2 : 0,
            channelType: 0, 
            videoStreamType: 0,
            transcodingConfig: transcodingConfig, 
            subscribeAudioUids: ["#allstream#"],
            subscribeVideoUids: callType === 'video' ? ["#allstream#"] : undefined,
            subscribeUidGroup: 0
          },
          recordingFileConfig: {
            avFileType: ["hls", "mp4"] 
          },
          storageConfig: {
            vendor: 1,
            region: this.S3_REGION_CODE,
            bucket: this.S3_BUCKET,
            accessKey: (this.configService.get<string>('AWS_ACCESS_KEY_ID') || '').trim(),
            secretKey: (this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '').trim(),
            // ✅ FILES will be saved in: recordings/{sanitizedSessionId}/filename
            fileNamePrefix: ['recordings', sanitizedSessionId],
          },
        },
      }, {
        auth: { username: this.AGORA_CUSTOMER_ID, password: this.AGORA_CUSTOMER_SECRET },
        headers: { 'Content-Type': 'application/json' },
      });

      const sid = response.data.sid;
      this.activeRecordings.set(sessionId, { resourceId, sid, uid: agoraUid });
      this.logger.log(`✅ Recording started: ${sessionId} | SID: ${sid}`);

      return { success: true, recordingId: sid, resourceId, message: 'Recording started' };
    } catch (error: any) {
      this.logger.error(`Recording start failed: ${error.response?.data?.message || error.message}`);
      throw error;
    }
  }

  async stopRecording(sessionId: string, channelName: string): Promise<any> {
    const recordingInfo = this.activeRecordings.get(sessionId);
    if (!recordingInfo) {
      this.logger.warn(`Stop requested for ${sessionId}, but no local active recording found.`);
      return { success: false, message: 'No active recording found locally' };
    }

    const { resourceId, sid, uid } = recordingInfo;
    const url = `https://api.agora.io/v1/apps/${this.AGORA_APP_ID}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/mix/stop`;

    try {
      const response = await axios.post(url, {
        cname: channelName, uid: uid.toString(), clientRequest: {},
      }, {
        auth: { username: this.AGORA_CUSTOMER_ID, password: this.AGORA_CUSTOMER_SECRET },
        headers: { 'Content-Type': 'application/json' },
      });

      // ✅ FIX: Correctly extract S3 Key avoiding double prefixes
      const fileList = response.data.serverResponse?.fileList || [];
      let s3Key = '';

      // 1. Prefer MP4 (Best for playback)
      const mp4File = fileList.find((f: any) => f.fileName.endsWith('.mp4'));
      if (mp4File) {
        // Agora returns the full path including prefix: "recordings/ID/file.mp4"
        s3Key = mp4File.fileName; 
      } 
      // 2. Fallback to first available file (likely .m3u8)
      else if (fileList.length > 0) {
        s3Key = fileList[0].fileName;
      } 
      // 3. Fallback: Manually construct path ONLY if list is empty
      else {
        const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9]/g, '');
        // We must include the prefix here manually because Agora didn't give us the full path
        s3Key = `recordings/${sanitizedSessionId}/${sid}_${channelName}.m3u8`;
        this.logger.warn(`⚠️ No file list from Agora stop. Constructed fallback key: ${s3Key}`);
      }

      const recordingUrl = `https://${this.S3_BUCKET}.s3.amazonaws.com/${s3Key}`;

      this.activeRecordings.delete(sessionId);
      this.logger.log(`✅ Recording stopped: ${sessionId} | URL: ${recordingUrl}`);

      return {
        success: true,
        recordingUrl,
        recordingS3Key: s3Key,
        recordingDuration: 0,
        message: 'Recording saved',
      };

    } catch (error: any) {
      this.activeRecordings.delete(sessionId);
      
      const status = error.response?.status;
      if (status === 400 || status === 404) {
         this.logger.warn(`Recording stop 404/400 (likely already stopped): ${sessionId}`);
         return { success: true, recordingUrl: null, message: 'Recording already stopped' };
      }

      this.logger.error(`Recording stop failed: ${error.response?.data?.message || error.message}`);
      return { success: false, recordingUrl: null, message: 'Recording failed' };
    }
  }

  async deleteRecording(recordingS3Key: string): Promise<any> {
    try {
      const command = new DeleteObjectCommand({ Bucket: this.S3_BUCKET, Key: recordingS3Key });
      await this.s3Client.send(command);
      return { success: true, message: 'Recording deleted' };
    } catch (error: any) {
      this.logger.error(`Recording deletion failed: ${error.message}`);
      throw error;
    }
  }
}