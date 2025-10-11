import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';

@Injectable()
export class StreamAgoraService {
  private appId: string;
  private appCertificate: string;

  constructor(private configService: ConfigService) {
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
