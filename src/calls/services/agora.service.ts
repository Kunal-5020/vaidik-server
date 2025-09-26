import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';
import { v4 as uuidv4 } from 'uuid';

export interface AgoraTokenResponse {
  token: string;
  channelName: string;
  uid: number;
  appId: string;
  expirationTimeInSeconds: number;
}

export interface CallChannelInfo {
  channelName: string;
  userToken: string;
  astrologerToken: string;
  userUid: number;
  astrologerUid: number;
  appId: string;
}

@Injectable()
export class AgoraService {
  private readonly logger = new Logger(AgoraService.name);
  private readonly appId: string;
  private readonly appCertificate: string;
  private readonly expirationTimeInSeconds = 3600 * 24; // 24 hours

  constructor(private configService: ConfigService) {
    const appId = this.configService.get<string>('AGORA_APP_ID');
    const appCertificate = this.configService.get<string>('AGORA_APP_CERTIFICATE');

    if (!appId || !appCertificate) {
      this.logger.warn('⚠️ Agora credentials not configured. Call features will be limited.');
      throw new Error('Agora credentials are required but missing in environment configuration.');
    }

    this.appId = appId;
    this.appCertificate = appCertificate;
  }

  // Generate RTC token for voice/video calls
  generateRtcToken(
    channelName: string,
    uid: number,
    role: 'publisher' | 'subscriber' = 'publisher'
  ): AgoraTokenResponse {
    if (!this.appId || !this.appCertificate) {
      throw new BadRequestException('Agora service not properly configured');
    }

    const agoraRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + this.expirationTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      this.appId,
      this.appCertificate,
      channelName,
      uid,
      agoraRole,
      privilegeExpiredTs
    );

    this.logger.log(`🎥 Generated Agora token for channel: ${channelName}, uid: ${uid}`);

    return {
      token,
      channelName,
      uid,
      appId: this.appId,
      expirationTimeInSeconds: this.expirationTimeInSeconds
    };
  }

  // Create a new call channel with tokens for both participants
  createCallChannel(userId: string, astrologerId: string): CallChannelInfo {
    // Generate unique channel name
    const channelName = `call_${userId}_${astrologerId}_${Date.now()}`;
    
    // Generate UIDs (use user IDs converted to numbers)
    const userUid = this.generateUidFromUserId(userId);
    const astrologerUid = this.generateUidFromUserId(astrologerId);

    // Generate tokens for both participants
    const userToken = this.generateRtcToken(channelName, userUid, 'publisher');
    const astrologerToken = this.generateRtcToken(channelName, astrologerUid, 'publisher');

    this.logger.log(`📞 Created call channel: ${channelName}`);

    return {
      channelName,
      userToken: userToken.token,
      astrologerToken: astrologerToken.token,
      userUid,
      astrologerUid,
      appId: this.appId
    };
  }

  // Generate UID from user ID string (convert to number)
  private generateUidFromUserId(userId: string): number {
    // Convert string to number using hash function
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Ensure positive number and within Agora's UID range (1 to 2^32-1)
    const uid = Math.abs(hash) % 2147483647 + 1;
    return uid;
  }

  // Renew token if needed
  renewToken(channelName: string, uid: number): AgoraTokenResponse {
    return this.generateRtcToken(channelName, uid);
  }

  // Validate if Agora service is available
  isAgoraConfigured(): boolean {
    return !!(this.appId && this.appCertificate);
  }

  // Get app configuration for frontend
  getAppConfig() {
    return {
      appId: this.appId,
      isConfigured: this.isAgoraConfigured()
    };
  }
}
