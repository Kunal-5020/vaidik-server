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
      // CHECK 1: Are we using Environment Variables? (Best for Production/Docker)
      if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        const serviceAccount = {
          projectId: process.env.FIREBASE_PROJECT_ID || 'vaidik-talk', // Fallback ID
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          // CRITICAL: Fix the newline characters from the .env string
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        };

        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
          });
          this.logger.log('✅ Firebase Admin initialized via ENV VARIABLES');
        }
      }
      // CHECK 2: If no ENV, look for the File (Fallback for Local Dev)
      else {
        const serviceAccountPath = path.resolve(
          process.cwd(),
          'src/config/firebase-service-account.json'
        );

        if (fs.existsSync(serviceAccountPath)) {
          const serviceAccount = require(serviceAccountPath);

          if (!admin.apps.length) {
            admin.initializeApp({
              credential: admin.credential.cert(serviceAccount),
            });
            this.logger.log('✅ Firebase Admin initialized via FILE');
          }
        } else {
          throw new Error('No Firebase credentials found (Checked ENV and File path)');
        }
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
    config?: {
      isFullScreen?: boolean;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      sound?: string;
      channelId?: string;
      category?: string;
      badge?: number;
      vibrate?: boolean;
    }
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Convert all data to strings for FCM
      const fcmData: Record<string, string> = {};

      if (data) {
        for (const [key, value] of Object.entries(data)) {
          fcmData[key] = String(value);
        }
      }

      if (config?.isFullScreen) {
        fcmData['fullScreen'] = 'true';
        fcmData['showInForeground'] = 'full-screen';
        fcmData['showInBackground'] = 'full-screen';
      }

      // 🆕 ADD priority and behavior flags
      if (config?.priority) {
        fcmData['priority'] = config.priority;
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
            sound: config?.sound || 'default',
            channelId: config?.channelId || 'vaidik_talk_notifications',
            priority: config?.priority === 'urgent' ? 'max' : 'high',
            defaultVibrateTimings: config?.vibrate !== false,
            defaultSound: !config?.sound, // Use default only if no custom sound
            ...(config?.isFullScreen && {
              visibility: 'public',
              tag: 'full_screen_call',
            }),
          },
        },
        apns: {
          payload: {
            aps: {
              sound: config?.sound?.replace('.mp3', '.wav') || 'default',
              badge: config?.badge || 1,
              'content-available': 1,
              ...(config?.isFullScreen && {
                'interruption-level': 'critical',
              }),
              ...(config?.category && {
                category: config.category,
              }),
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      this.logger.log(
        `✅ Push sent: ${response} | Type: ${config?.priority || 'default'} | FullScreen: ${
          config?.isFullScreen || false
        }`
      );

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
    config?: {
      isFullScreen?: boolean;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      sound?: string;
      channelId?: string;
      badge?: number;
    }
  ): Promise<{ successCount: number; failureCount: number; failedTokens?: string[] }> {
    try {
      if (!fcmTokens || fcmTokens.length === 0) {
        return { successCount: 0, failureCount: 0, failedTokens: [] };
      }

      const validTokens = fcmTokens.filter((t) => t && typeof t === 'string' && t.length > 0);

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
            sound: config?.sound || 'default',
            channelId: config?.channelId || 'vaidik_talk_notifications',
            priority: config?.priority === 'urgent' ? 'max' : 'high',
            defaultVibrateTimings: true,
            ...(config?.isFullScreen && {
              visibility: 'public',
              tag: 'full_screen_call',
            }),
          },
        },
        apns: {
          payload: {
            aps: {
              sound: config?.sound?.replace('.mp3', '.wav') || 'default',
              badge: config?.badge || 1,
              'content-available': 1,
              ...(config?.isFullScreen && {
                'interruption-level': 'critical',
              }),
            },
          },
        },
      };

      this.logger.log(
        `📤 Sending to ${validTokens.length} FCM tokens (fullScreen: ${config?.isFullScreen})`
      );

      const response = await admin.messaging().sendEachForMulticast(message);

      // ✅ ENHANCED LOGGING: Log specific errors for failures
      if (response.failureCount > 0) {
        const failedTokensList: string[] = [];
        response.responses.forEach((res, idx) => {
          if (!res.success) {
            const tokenPreview = validTokens[idx]
              ? validTokens[idx].substring(0, 15) + '...'
              : 'Unknown';
            failedTokensList.push(validTokens[idx]);

            this.logger.error(
              `❌ FCM Failure for token [${tokenPreview}]: ` +
                `Code: ${res.error?.code} | Message: ${res.error?.message}`
            );
          }
        });
      }

      this.logger.log(
        `📊 FCM Summary: ${response.successCount} success, ${response.failureCount} failed`
      );

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