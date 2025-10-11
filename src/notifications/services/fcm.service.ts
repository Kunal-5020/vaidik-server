import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);

  constructor(private configService: ConfigService) {
    const serviceAccount = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
    
    if (serviceAccount && !admin.apps.length) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert(require(serviceAccount)),
        });
        this.logger.log('Firebase Admin initialized successfully');
      } catch (error: any) {
        this.logger.error(`Failed to initialize Firebase: ${error.message}`);
      }
    }
  }

  // Send push notification to single device
  async sendToDevice(
    fcmToken: string,
    title: string,
    body: string,
    data?: Record<string, string>,
    imageUrl?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: {
          title,
          body,
          imageUrl,
        },
        data: data || {},
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'vaidik_talk_notifications',
            priority: 'high',
            defaultVibrateTimings: true,
            defaultSound: true,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              'content-available': 1,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      this.logger.log(`✅ Push sent successfully: ${response}`);

      return {
        success: true,
        messageId: response,
      };
    } catch (error: any) {
      this.logger.error(`❌ Push failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Send to multiple devices (batch)
  async sendToMultipleDevices(
    fcmTokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
    imageUrl?: string
  ): Promise<{ successCount: number; failureCount: number }> {
    try {
      const message: admin.messaging.MulticastMessage = {
        tokens: fcmTokens,
        notification: {
          title,
          body,
          imageUrl,
        },
        data: data || {},
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'vaidik_talk_notifications',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      this.logger.log(
        `📤 Batch push: ${response.successCount} success, ${response.failureCount} failed`
      );

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error: any) {
      this.logger.error(`❌ Batch push failed: ${error.message}`);
      return {
        successCount: 0,
        failureCount: fcmTokens.length,
      };
    }
  }
}
