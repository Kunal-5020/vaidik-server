// src/calls/services/agora.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

@Injectable()
export class AgoraService {
  private readonly logger = new Logger(AgoraService.name);
  private appId: string;
  private appCertificate: string;

  constructor(private configService: ConfigService) {
    this.appId = this.configService.get<string>('AGORA_APP_ID') || '';
    this.appCertificate = this.configService.get<string>('AGORA_APP_CERTIFICATE') || '';

    if (!this.appId || !this.appCertificate) {
      this.logger.warn('Agora credentials not configured');
    }
  }

  /**
   * ✅ Generate RTC token for user to join call
   */
  generateRtcToken(
    channelName: string,
    uid: number,
    role: 'publisher' | 'subscriber' = 'publisher',
    expirationTimeInSeconds: number = 3600
  ): string {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
    const roleType = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

    const token = RtcTokenBuilder.buildTokenWithUid(
      this.appId,
      this.appCertificate,
      channelName,
      uid,
      roleType,
      privilegeExpiredTs
    );

    this.logger.log(`Generated token for channel: ${channelName} | UID: ${uid}`);
    return token;
  }

  /**
   * ✅ Generate recording token (higher UID for cloud recording)
   */
  generateRecordingToken(channelName: string): { token: string; uid: number } {
    const recordingUid = Math.floor(Math.random() * 900000) + 100000; // 6-digit UID
    const token = this.generateRtcToken(channelName, recordingUid, 'publisher', 7200); // 2 hours

    this.logger.log(`Generated recording token | UID: ${recordingUid}`);
    return { token, uid: recordingUid };
  }

  /**
   * ✅ Generate unique channel name
   */
  generateChannelName(): string {
    return `channel_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;
  }

  /**
   * ✅ Generate random UID (1-100000)
   */
  generateUid(): number {
    return Math.floor(Math.random() * 100000) + 1;
  }

  /**
   * ✅ Get Agora App ID (for frontend)
   */
  getAppId(): string {
    return this.appId;
  }
}
