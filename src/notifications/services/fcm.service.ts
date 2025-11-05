import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);

constructor() {
    try {
      // ✅ Always resolve from project root, not from dist
      const serviceAccountPath = path.resolve(
        process.cwd(),
        'src/config/firebase-service-account.json'
      );

      if (!fs.existsSync(serviceAccountPath)) {
        throw new Error(`Service account file not found at: ${serviceAccountPath}`);
      }

      const serviceAccount = require(serviceAccountPath);

      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        this.logger.log('✅ Firebase Admin initialized successfully (from JSON file)');
      }
    } catch (error: any) {
      this.logger.error(`❌ Failed to initialize Firebase: ${error.message}`);
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

  /**
   * Send notification to multiple devices (NEW)
   */
  async sendToMultipleDevices(
    fcmTokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
    imageUrl?: string
  ): Promise<{ successCount: number; failureCount: number; failedTokens: string[] }> {
    try {
      if (!fcmTokens || fcmTokens.length === 0) {
        return { successCount: 0, failureCount: 0, failedTokens: [] };
      }

      const message: admin.messaging.MulticastMessage = {
        notification: {
          title,
          body,
          ...(imageUrl && { imageUrl }),
        },
        data: data || {},
        tokens: fcmTokens,
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

      const failedTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(fcmTokens[idx]);
        }
      });

      console.log(`✅ FCM Multicast: ${response.successCount} success, ${response.failureCount} failed`);

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        failedTokens,
      };
    } catch (error) {
      console.error('❌ FCM multicast send error:', error);
      return {
        successCount: 0,
        failureCount: fcmTokens.length,
        failedTokens: fcmTokens,
      };
    }
  }
}
