import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { StreamAgoraService } from './stream-agora.service';

// Agora Region Mapping for AWS S3
const AGORA_REGION_MAPPING: Record<string, number> = {
  'us-east-1': 0,
  'us-east-2': 1,
  'us-west-1': 2,
  'us-west-2': 3,
  'eu-west-1': 4,
  'eu-west-2': 5,
  'eu-west-3': 6,
  'eu-central-1': 7,
  'ap-southeast-1': 8,
  'ap-southeast-2': 9,
  'ap-northeast-1': 10,
  'ap-northeast-2': 11,
  'sa-east-1': 12,
  'ca-central-1': 13,
  'ap-south-1': 14, // Mumbai
  'cn-north-1': 15,
  'cn-northwest-1': 16,
  'us-gov-west-1': 17,
};

@Injectable()
export class StreamRecordingService {
  private readonly logger = new Logger(StreamRecordingService.name);
  private readonly baseUrl = 'https://api.agora.io/v1/apps';
  private readonly s3Bucket: string;
  private readonly s3RegionCode: number;

  constructor(
    private configService: ConfigService,
    private streamAgoraService: StreamAgoraService // ✅ Injected for Token Generation
  ) {
    this.s3Bucket = this.configService.get<string>('AWS_S3_BUCKET') || '';
    
    // Calculate S3 Region Code once
    const awsRegion = this.configService.get<string>('AWS_REGION') || 'ap-south-1';
    this.s3RegionCode = AGORA_REGION_MAPPING[awsRegion] ?? 0;
  }

  /**
   * Start recording a stream
   */
  async startRecording(
    channelName: string,
    recorderUid: string, // This must be the UID for the RECORDER bot
    streamId: string,
  ): Promise<any> {
    try {
      const appId = this.configService.get<string>('AGORA_APP_ID');
      const customerId = this.configService.get<string>('AGORA_CUSTOMER_ID');
      const customerSecret = this.configService.get<string>('AGORA_CUSTOMER_SECRET');

      // 1. Generate Basic Auth
      const auth = Buffer.from(`${customerId}:${customerSecret}`).toString('base64');

      // 2. Acquire Resource
      const acquireResponse = await axios.post(
        `${this.baseUrl}/${appId}/cloud_recording/acquire`,
        {
          cname: channelName,
          uid: recorderUid,
          clientRequest: { resourceExpiredHour: 24 },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`,
          },
        },
      );
      const resourceId = acquireResponse.data.resourceId;

      // 3. Generate Token for the Recorder Bot
      // Ensure recorderUid is treated as number for token generation
      const token = this.streamAgoraService.generateBroadcasterToken(
        channelName, 
        parseInt(recorderUid, 10)
      );

      // 4. Sanitize S3 Path
      const sanitizedStreamId = streamId.replace(/[^a-zA-Z0-9]/g, '');

      // 5. Start Recording
      const startResponse = await axios.post(
        `${this.baseUrl}/${appId}/cloud_recording/resourceid/${resourceId}/mode/mix/start`,
        {
          cname: channelName,
          uid: recorderUid,
          clientRequest: {
            token: token, // ✅ Token is REQUIRED
            recordingConfig: {
              channelType: 1, // Live broadcast
              streamTypes: 2, // Audio + Video
              maxIdleTime: 30,
              transcodingConfig: {
                width: 1280, // HD Quality
                height: 720,
                fps: 15,
                bitrate: 2260,
                mixedVideoLayout: 1, // Best fit
                backgroundColor: '#000000'
              },
              subscribeAudioUids: ["#allstream#"],
              subscribeVideoUids: ["#allstream#"],
            },
            recordingFileConfig: {
              avFileType: ["hls", "mp4"] // ✅ Request MP4 explicitly
            },
            storageConfig: {
              vendor: 1, // AWS S3
              region: this.s3RegionCode, // ✅ Dynamic Region (14 for Mumbai)
              bucket: this.s3Bucket,
              accessKey: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
              secretKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
              fileNamePrefix: ['recordings', 'streams', sanitizedStreamId],
            },
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`,
          },
        },
      );

      const sid = startResponse.data.sid;
      this.logger.log(`✅ Stream Recording started: ${streamId} | SID: ${sid}`);

      return {
        success: true,
        resourceId,
        sid,
        recorderUid
      };
    } catch (error: any) {
      this.logger.error(`❌ Failed to start stream recording: ${error.response?.data?.message || error.message}`);
      throw error;
    }
  }

  /**
   * Stop recording
   */
  async stopRecording(
    channelName: string,
    recorderUid: string,
    resourceId: string,
    sid: string,
    streamId: string
  ): Promise<any> {
    try {
      const appId = this.configService.get<string>('AGORA_APP_ID');
      const customerId = this.configService.get<string>('AGORA_CUSTOMER_ID');
      const customerSecret = this.configService.get<string>('AGORA_CUSTOMER_SECRET');
      const auth = Buffer.from(`${customerId}:${customerSecret}`).toString('base64');

      const response = await axios.post(
        `${this.baseUrl}/${appId}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/mix/stop`,
        { cname: channelName, uid: recorderUid, clientRequest: {} },
        { headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' } }
      );

      const fileList = response.data.serverResponse?.fileList || [];
      let s3Key = '';

      // ✅ FIX: Use Agora's returned filename directly (it includes the path)
      const mp4File = fileList.find((f: any) => f.fileName.endsWith('.mp4'));
      
      if (mp4File) {
        // fileList returns: "recordings/streams/ID/filename.mp4" -> Perfect S3 Key
        s3Key = mp4File.fileName;
      } else if (fileList.length > 0) {
        s3Key = fileList[0].fileName;
      } else {
        // Fallback: Only manually construct path if list is empty
        const sanitizedStreamId = streamId.replace(/[^a-zA-Z0-9]/g, '');
        const fileName = `${sid}_${channelName}.m3u8`;
        s3Key = `recordings/streams/${sanitizedStreamId}/${fileName}`;
        this.logger.warn(`⚠️ No file list from Agora. Constructed fallback key: ${s3Key}`);
      }

      const recordingUrl = `https://${this.s3Bucket}.s3.amazonaws.com/${s3Key}`;
      this.logger.log(`✅ Stream Recording stopped. URL: ${recordingUrl}`);

      return {
        success: true,
        recordingUrl,
        s3Key,
        fileList: response.data.serverResponse?.fileList,
      };

    } catch (error: any) {
      const status = error.response?.status;
      if (status === 404 || status === 400) {
        this.logger.warn(`Stream Recording already stopped: ${sid}`);
        return { success: true, message: 'Recording already stopped' };
      }
      this.logger.error(`❌ Stop recording failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}