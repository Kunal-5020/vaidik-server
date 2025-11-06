// src/notifications/services/fcm.service.ts (UPDATED - Handle optional imageUrl)
import { Injectable, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);

  constructor() {
    try {
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
        this.logger.log('✅ Firebase Admin initialized successfully');
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
      // ✅ Validate imageUrl - only include if it's a valid URL
      const notificationPayload: any = {
        title,
        body,
      };

      // ✅ Only add imageUrl if it's a non-empty valid URL
      if (imageUrl && this.isValidUrl(imageUrl)) {
        notificationPayload.imageUrl = imageUrl;
      }

      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: notificationPayload,
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
  // src/notifications/services/fcm.service.ts (VERIFY THIS METHOD)
async sendToMultipleDevices(
  fcmTokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
  imageUrl?: string
): Promise<{ successCount: number; failureCount: number; failedTokens?: string[] }> {
  try {
    if (!fcmTokens || fcmTokens.length === 0) {
      return { successCount: 0, failureCount: 0, failedTokens: [] };
    }

    const validTokens = fcmTokens.filter(t => t && typeof t === 'string' && t.length > 0);
    
    if (validTokens.length === 0) {
      this.logger.warn('⚠️ No valid FCM tokens');
      return { successCount: 0, failureCount: fcmTokens.length, failedTokens: fcmTokens };
    }

    const notificationPayload: any = { title, body };
    if (imageUrl && this.isValidUrl(imageUrl)) {
      notificationPayload.imageUrl = imageUrl;
    }

    const message: admin.messaging.MulticastMessage = {
      notification: notificationPayload,
      data: data || {},
      tokens: validTokens,
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'vaidik_talk_notifications',
        },
      },
    };

    this.logger.log(`📤 Sending to ${validTokens.length} FCM tokens`);
    this.logger.log(`🔑 First token (30 chars): ${validTokens[0]?.substring(0, 30)}...`);

    const response = await admin.messaging().sendEachForMulticast(message);

    // ✅ Log each response individually
    response.responses.forEach((resp, idx) => {
      if (resp.success) {
        this.logger.log(`✅ Token ${idx}: Success - ${resp.messageId}`);
      } else {
        this.logger.error(`❌ Token ${idx}: Failed`, {
          token: validTokens[idx]?.substring(0, 30) + '...',
          error: resp.error?.code,
          message: resp.error?.message,
        });
      }
    });

    this.logger.log(`📊 FCM Summary: ${response.successCount} success, ${response.failureCount} failed`);

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      failedTokens: [],
    };
  } catch (error: any) {
    this.logger.error('❌ FCM multicast error:', {
      code: error.code,
      message: error.message,
      details: error.toString(),
    });
    return {
      successCount: 0,
      failureCount: fcmTokens.length,
      failedTokens: fcmTokens,
    };
  }
}

  /**
   * ✅ Helper method to validate URL
   */
  private isValidUrl(urlString: string): boolean {
    try {
      // Check if it's empty
      if (!urlString || typeof urlString !== 'string') {
        return false;
      }

      // Trim whitespace
      const trimmed = urlString.trim();
      if (trimmed === '') {
        return false;
      }

      // Try to parse as URL
      const url = new URL(trimmed);
      
      // Check if protocol is http or https
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }
}
