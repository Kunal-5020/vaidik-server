import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

@Injectable()
export class AgoraService {
  private appId: string;
  private appCertificate: string;

  constructor(private configService: ConfigService) {
    this.appId = this.configService.get<string>('AGORA_APP_ID') || '';
    this.appCertificate = this.configService.get<string>('AGORA_APP_CERTIFICATE') || '';
  }

  generateRtcToken(
    channelName: string,
    uid: number,
    role: 'publisher' | 'subscriber' = 'publisher',
    expirationTimeInSeconds: number = 3600
  ): string {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;
    const roleType = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;

    return RtcTokenBuilder.buildTokenWithUid(
      this.appId,
      this.appCertificate,
      channelName,
      uid,
      roleType,
      privilegeExpiredTs
    );
  }

  // ✅ Generate recording token (with higher UID for cloud recording bot)
  generateRecordingToken(channelName: string): { token: string; uid: number } {
    const recordingUid = Math.floor(Math.random() * 900000) + 100000; // 6-digit UID for recording bot
    const token = this.generateRtcToken(channelName, recordingUid, 'publisher', 7200); // 2 hours

    return { token, uid: recordingUid };
  }

  generateChannelName(): string {
    return `channel_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  generateUid(): number {
    return Math.floor(Math.random() * 100000) + 1;
  }

  getAppId(): string {
    return this.appId;
  }
}
