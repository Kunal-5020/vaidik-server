// src/notifications/services/fcm.service.ts
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

  async sendToDevice(
    fcmToken: string,
    title: string,
    body: string,
    data?: Record<string, any>,
    imageUrl?: string,
    isFullScreen?: boolean
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Convert all data to strings for FCM
      const fcmData: Record<string, string> = {};
      
      if (data) {
        for (const [key, value] of Object.entries(data)) {
          fcmData[key] = String(value);
        }
      }

      // Add fullScreen flag
      if (isFullScreen) {
        fcmData['fullScreen'] = 'true';
      }

      // Build notification payload
      const notificationPayload: any = {
        title,
        body,
      };

      if (imageUrl && this.isValidUrl(imageUrl)) {
        notificationPayload.imageUrl = imageUrl;
      }

      const message: admin.messaging.Message = {
        token: fcmToken,
        notification: notificationPayload,
        data: fcmData,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'vaidik_talk_notifications',
            priority: 'high',
            defaultVibrateTimings: true,
            defaultSound: true,
            ...(isFullScreen && {
              visibility: 'public',
              tag: 'full_screen_call',
            }),
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              'content-available': 1,
              ...(isFullScreen && {
                'interruption-level': 'critical',
              }),
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      this.logger.log(`✅ Push sent successfully: ${response} (fullScreen: ${isFullScreen})`);

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

  async sendToMultipleDevices(
    fcmTokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
    imageUrl?: string,
    isFullScreen?: boolean
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
            priority: 'high',
            defaultVibrateTimings: true,
            ...(isFullScreen && {
              visibility: 'public',
              tag: 'full_screen_call',
            }),
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              'content-available': 1,
              ...(isFullScreen && {
                'interruption-level': 'critical',
              }),
            },
          },
        },
      };

      this.logger.log(`📤 Sending to ${validTokens.length} FCM tokens (fullScreen: ${isFullScreen})`);

      const response = await admin.messaging().sendEachForMulticast(message);

      this.logger.log(`📊 FCM Summary: ${response.successCount} success, ${response.failureCount} failed`);

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        failedTokens: [],
      };
    } catch (error: any) {
      this.logger.error('❌ FCM multicast error:', error.message);
      return {
        successCount: 0,
        failureCount: fcmTokens.length,
        failedTokens: fcmTokens,
      };
    }
  }

  private isValidUrl(urlString: string): boolean {
    try {
      if (!urlString || typeof urlString !== 'string') {
        return false;
      }
      const trimmed = urlString.trim();
      if (trimmed === '') {
        return false;
      }
      const url = new URL(trimmed);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }
}
