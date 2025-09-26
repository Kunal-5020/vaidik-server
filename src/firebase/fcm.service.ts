import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { FirebaseAdminConfig } from './firebase-admin.config';
import * as admin from 'firebase-admin';

export interface NotificationData {
  title: string;
  body: string;
  data?: { [key: string]: string };
  imageUrl?: string;
}

export interface FCMResponse {
  success: boolean;
  successCount: number;
  failureCount: number;
  failedTokens: string[];
  messageId?: string;
}

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private messaging: admin.messaging.Messaging;

  constructor(private firebaseConfig: FirebaseAdminConfig) {
    this.messaging = this.firebaseConfig.getMessaging();
  }

  // Send notification to single device
  async sendToDevice(
    token: string,
    notification: NotificationData
  ): Promise<FCMResponse> {
    try {
      const message: admin.messaging.Message = {
        token,
        notification: {
          title: notification.title,
          body: notification.body,
          ...(notification.imageUrl && { imageUrl: notification.imageUrl })
        },
        data: notification.data || {},
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            channelId: 'vaidiktalk_notifications',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
          },
          data: notification.data || {}
        },
        apns: {
          headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert'
          },
          payload: {
            aps: {
              alert: {
                title: notification.title,
                body: notification.body
              },
              sound: 'default',
              badge: 1,
              category: 'FLUTTER_NOTIFICATION_CLICK'
            }
          }
        }
      };

      const response = await this.messaging.send(message);
      this.logger.log(`✅ FCM sent successfully to ${token}: ${response}`);

      return {
        success: true,
        successCount: 1,
        failureCount: 0,
        failedTokens: [],
        messageId: response
      };

    } catch (error) {
      this.logger.error(`❌ FCM send failed for token ${token}: ${error.message}`);
      return {
        success: false,
        successCount: 0,
        failureCount: 1,
        failedTokens: [token],
        messageId: undefined
      };
    }
  }

  // FIXED: Send notification to multiple devices using sendEach instead of sendMulticast
  async sendToMultipleDevices(
    tokens: string[],
    notification: NotificationData
  ): Promise<FCMResponse> {
    if (!tokens || tokens.length === 0) {
      throw new BadRequestException('No device tokens provided');
    }

    try {
      // Create individual messages for each token
      const messages: admin.messaging.Message[] = tokens.map(token => ({
        token,
        notification: {
          title: notification.title,
          body: notification.body,
          ...(notification.imageUrl && { imageUrl: notification.imageUrl })
        },
        data: notification.data || {},
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            channelId: 'vaidiktalk_notifications',
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
          }
        },
        apns: {
          headers: {
            'apns-priority': '10',
            'apns-push-type': 'alert'
          },
          payload: {
            aps: {
              alert: {
                title: notification.title,
                body: notification.body
              },
              sound: 'default',
              badge: 1,
              category: 'FLUTTER_NOTIFICATION_CLICK'
            }
          }
        }
      }));

      // Use sendEach instead of sendMulticast
      const response = await this.messaging.sendEach(messages);
      
      // Extract failed tokens
      const failedTokens = response.responses
        .map((resp, idx) => !resp.success ? tokens[idx] : null)
        .filter(token => token !== null);

      this.logger.log(
        `📊 FCM Batch Result: ${response.successCount} success, ${response.failureCount} failed`
      );

      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            this.logger.error(`❌ FCM failed for token ${tokens[idx]}: ${resp.error?.message}`);
          }
        });
      }

      return {
        success: response.successCount > 0,
        successCount: response.successCount,
        failureCount: response.failureCount,
        failedTokens: failedTokens as string[]
      };

    } catch (error) {
      this.logger.error(`❌ FCM batch send error: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to send push notifications');
    }
  }

  // Send notification to topic subscribers
  async sendToTopic(
    topic: string,
    notification: NotificationData
  ): Promise<FCMResponse> {
    try {
      const message: admin.messaging.Message = {
        topic,
        notification: {
          title: notification.title,
          body: notification.body,
          ...(notification.imageUrl && { imageUrl: notification.imageUrl })
        },
        data: notification.data || {},
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'vaidiktalk_notifications',
          }
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: notification.title,
                body: notification.body
              },
              sound: 'default'
            }
          }
        }
      };

      const messageId = await this.messaging.send(message);
      this.logger.log(`✅ FCM sent to topic ${topic}: ${messageId}`);

      return {
        success: true,
        successCount: 1,
        failureCount: 0,
        failedTokens: [],
        messageId
      };

    } catch (error) {
      this.logger.error(`❌ FCM topic send failed for ${topic}: ${error.message}`);
      return {
        success: false,
        successCount: 0,
        failureCount: 1,
        failedTokens: [],
        messageId: undefined
      };
    }
  }

  // Subscribe devices to topic
  async subscribeToTopic(tokens: string[], topic: string): Promise<void> {
    try {
      await this.messaging.subscribeToTopic(tokens, topic);
      this.logger.log(`✅ Subscribed ${tokens.length} tokens to topic: ${topic}`);
    } catch (error) {
      this.logger.error(`❌ Topic subscription failed: ${error.message}`);
      throw new BadRequestException('Failed to subscribe to topic');
    }
  }

  // Unsubscribe devices from topic
  async unsubscribeFromTopic(tokens: string[], topic: string): Promise<void> {
    try {
      await this.messaging.unsubscribeFromTopic(tokens, topic);
      this.logger.log(`✅ Unsubscribed ${tokens.length} tokens from topic: ${topic}`);
    } catch (error) {
      this.logger.error(`❌ Topic unsubscription failed: ${error.message}`);
      throw new BadRequestException('Failed to unsubscribe from topic');
    }
  }

  // Validate FCM token
  async validateToken(token: string): Promise<boolean> {
    try {
      await this.messaging.send({
        token,
        data: { test: 'true' }
      }, true); // Dry run
      return true;
    } catch (error) {
      this.logger.warn(`❌ Invalid FCM token: ${token}`);
      return false;
    }
  }
}
