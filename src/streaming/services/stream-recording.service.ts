import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class StreamRecordingService {
  private readonly logger = new Logger(StreamRecordingService.name);
  private readonly baseUrl = 'https://api.agora.io/v1/apps';

  constructor(private configService: ConfigService) {}

  /**
   * Start recording a stream
   */
  async startRecording(
    channelName: string,
    uid: string,
    streamId: string,
  ): Promise<any> {
    try {
      const appId = this.configService.get<string>('AGORA_APP_ID');
      const customerId = this.configService.get<string>('AGORA_CUSTOMER_ID');
      const customerSecret = this.configService.get<string>('AGORA_CUSTOMER_SECRET');

      // Generate Basic Auth
      const auth = Buffer.from(`${customerId}:${customerSecret}`).toString('base64');

      // Recording configuration
      const recordingConfig = {
        cname: channelName,
        uid: uid,
        clientRequest: {
          recordingConfig: {
            channelType: 1, // Live broadcast
            streamTypes: 2, // Audio + Video
            maxIdleTime: 30,
            transcodingConfig: {
              width: 640,
              height: 360,
              fps: 15,
              bitrate: 500,
              mixedVideoLayout: 1, // Best fit layout
            },
          },
          storageConfig: {
            vendor: 1, // AWS S3
            region: 4, // ap-south-1
            bucket: this.configService.get<string>('AWS_S3_BUCKET'),
            accessKey: this.configService.get<string>('AWS_ACCESS_KEY_ID'),
            secretKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY'),
            fileNamePrefix: [`recordings/${streamId}`],
          },
        },
      };

      // Start recording
      const response = await axios.post(
        `${this.baseUrl}/${appId}/cloud_recording/resourceid`,
        recordingConfig,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`,
          },
        },
      );

      const resourceId = response.data.resourceId;

      // Acquire recording
      const acquireResponse = await axios.post(
        `${this.baseUrl}/${appId}/cloud_recording/resourceid/${resourceId}/mode/mix/start`,
        recordingConfig,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`,
          },
        },
      );

      const sid = acquireResponse.data.sid;

      this.logger.log(`✅ Recording started: ${streamId}`);

      return {
        success: true,
        resourceId,
        sid,
      };
    } catch (error) {
      this.logger.error('❌ Failed to start recording:', error);
      throw error;
    }
  }

  /**
   * Stop recording
   */
  async stopRecording(
    channelName: string,
    uid: string,
    resourceId: string,
    sid: string,
  ): Promise<any> {
    try {
      const appId = this.configService.get<string>('AGORA_APP_ID');
      const customerId = this.configService.get<string>('AGORA_CUSTOMER_ID');
      const customerSecret = this.configService.get<string>('AGORA_CUSTOMER_SECRET');

      const auth = Buffer.from(`${customerId}:${customerSecret}`).toString('base64');

      const response = await axios.post(
        `${this.baseUrl}/${appId}/cloud_recording/resourceid/${resourceId}/sid/${sid}/mode/mix/stop`,
        {
          cname: channelName,
          uid: uid,
          clientRequest: {},
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${auth}`,
          },
        },
      );

      this.logger.log(`✅ Recording stopped: ${sid}`);

      return {
        success: true,
        fileList: response.data.serverResponse.fileList,
      };
    } catch (error) {
      this.logger.error('❌ Failed to stop recording:', error);
      throw error;
    }
  }
}
