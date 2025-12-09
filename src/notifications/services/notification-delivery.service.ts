// src/notifications/services/notification-delivery.service.ts
import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MobileNotificationGateway } from '../gateways/mobile-notification.gateway';
import { WebNotificationGateway } from '../gateways/web-notification.gateway'; // 🆕 NEW
import { FcmService } from './fcm.service';
import { Notification, NotificationDocument } from '../schemas/notification.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { getNotificationConfig, shouldUseSocketIo } from '../config/notification-types.config';
import { AdminNotificationGateway } from '../../admin/features/notifications/gateways/admin-notification.gateway';

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private mobileGateway: MobileNotificationGateway,
    private webGateway: WebNotificationGateway, // 🆕 NEW
    @Inject(forwardRef(() => AdminNotificationGateway))
    private readonly adminGateway: AdminNotificationGateway | undefined,
    private fcmService: FcmService,
  ) {}

  private isValidUrl(urlString?: string): boolean {
    try {
      if (!urlString || typeof urlString !== 'string') return false;
      const trimmed = urlString.trim();
      if (trimmed === '') return false;
      new URL(trimmed);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 🆕 UPDATED: Deliver to MOBILE (FCM + Socket.io) AND WEB (Socket.io)
   */
  async deliverToMobile(
    notification: NotificationDocument,
    targetDeviceId?: string,
    targetFcmToken?: string
  ): Promise<void> {
    try {
      const recipientId = notification.recipientId.toString();
      const typeConfig = getNotificationConfig(notification.type);

      let recipient;
      if (notification.recipientModel === 'User') {
        recipient = await this.userModel.findById(recipientId).select('devices').lean().exec();
      } else {
        recipient = await this.astrologerModel.findById(recipientId).select('devices').lean().exec();
      }

      if (!recipient?.devices?.length) {
        this.logger.log(`⏭️ No devices for ${notification.recipientModel} ${recipientId}`);
      }

      // 🆕 1. SEND TO WEB CLIENTS (Browser)
      const userType = notification.recipientModel === 'User' ? 'user' : 'astrologer';
      const isWebConnected = this.webGateway.isUserConnected(recipientId, userType);

      if (isWebConnected) {
        this.webGateway.sendToUser(
          recipientId,
          userType,
          'notification',
          {
            notificationId: notification.notificationId,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data,
            imageUrl: notification.imageUrl,
            actionUrl: notification.actionUrl,
            priority: notification.priority || typeConfig.priority,
            timestamp: notification.createdAt,
          }
        );
        this.logger.log(`🌐 [Web] Sent to ${userType} ${recipientId}`);
      }

      // 🎯 2. SEND TO MOBILE APP (Socket.io for real-time types)
      const useSocketIo = shouldUseSocketIo(notification.type);
      let socketSent = false;

      if (useSocketIo && this.mobileGateway.isUserOnline(recipientId)) {
        if (targetDeviceId) {
          socketSent = this.mobileGateway.sendToUserDevice(recipientId, targetDeviceId, notification);
        } else {
          socketSent = this.mobileGateway.sendToUser(recipientId, notification);
        }

        if (socketSent) {
          this.logger.log(`⚡ [Mobile Socket] Instant delivery: ${notification.type} to ${recipientId}`);
          notification.isSocketSent = true;
          notification.socketSentAt = new Date();
          await notification.save();

          // For chat/messages, if socket delivery succeeded, we're done
          if (isWebConnected || socketSent) {
            return; // Both web and mobile got it via socket, no need for FCM
          }
        }
      }

      // 📤 3. FCM DELIVERY (Fallback for mobile if not online)
      if (!recipient?.devices?.length) {
        return; // Already logged above
      }

      let fcmTokens: string[] = [];

      if (targetDeviceId) {
        const device = recipient.devices.find((d: any) => d.deviceId === targetDeviceId && d.isActive);
        if (device?.fcmToken) {
          fcmTokens.push(device.fcmToken);
        }
      } else if (targetFcmToken) {
        fcmTokens = [targetFcmToken];
      } else {
        fcmTokens = recipient.devices
          .filter((d: any) => d.isActive)
          .map((d: any) => d.fcmToken)
          .filter(Boolean);
      }

      if (fcmTokens.length === 0) {
        this.logger.log(`⏭️ No FCM tokens available for ${recipientId}`);
        return;
      }

      // Build FCM data with behavior flags
      const fcmData: Record<string, string> = {};
      if (notification.data) {
        for (const [key, value] of Object.entries(notification.data)) {
          fcmData[key] = String(value);
        }
      }
      fcmData['notificationId'] = notification.notificationId;
      fcmData['type'] = notification.type;
      fcmData['foregroundBehavior'] = typeConfig.foregroundBehavior;
      fcmData['backgroundBehavior'] = typeConfig.backgroundBehavior;
      fcmData['priority'] = typeConfig.priority;

      if (notification.actionUrl) {
        fcmData['actionUrl'] = notification.actionUrl;
      }

      const validImageUrl = this.isValidUrl(notification.imageUrl) ? notification.imageUrl : undefined;

      // Send via FCM with type configuration
      const fcmResult = await this.fcmService.sendToMultipleDevices(
        fcmTokens,
        notification.title,
        notification.message,
        fcmData,
        validImageUrl,
        {
          isFullScreen: typeConfig.isFullScreen,
          priority: typeConfig.priority,
          sound: typeConfig.sound,
          channelId: typeConfig.androidChannelId,
          badge: 1,
        }
      );

      if (fcmResult.successCount > 0) {
        notification.isPushSent = true;
        notification.pushSentAt = new Date();
        await notification.save();
        this.logger.log(
          `✅ [FCM] Delivered: ${notification.type} to ${recipientId} | ` +
            `Success: ${fcmResult.successCount}/${fcmTokens.length} | ` +
            `Priority: ${typeConfig.priority} | FullScreen: ${typeConfig.isFullScreen}`
        );
      } else {
        this.logger.warn(`❌ [FCM] Failed for all ${fcmTokens.length} tokens`);
      }
    } catch (error) {
      this.logger.error(`❌ Delivery error: ${(error as any).message}`);
    }
  }

  async deliverToAdmins(notification: NotificationDocument): Promise<void> {
    if (!this.adminGateway) {
      this.logger.debug('AdminNotificationGateway not available, skipping admin delivery');
      return;
    }

    try {
      this.adminGateway.broadcastToAllAdmins('notification', {
        notificationId: notification.notificationId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        recipientId: notification.recipientId.toString(),
        recipientModel: notification.recipientModel,
        timestamp: notification.createdAt,
      });
      this.logger.log(`✅ Admin notification sent: ${notification.type}`);
    } catch (error) {
      this.logger.error(`❌ Admin delivery error: ${(error as any).message}`);
    }
  }

  sendRealtimeEventToAdmins(eventType: string, eventData: any): void {
    if (!this.adminGateway) {
      this.logger.debug('AdminNotificationGateway not available');
      return;
    }

    try {
      this.adminGateway.broadcastToAllAdmins(eventType, eventData);
    } catch (error) {
      this.logger.error(`❌ Realtime event error: ${(error as any).message}`);
    }
  }

  broadcastSystemAlert(message: string, data?: any): void {
    if (!this.adminGateway) {
      this.logger.debug('AdminNotificationGateway not available');
      return;
    }

    try {
      this.adminGateway.broadcastToAllAdmins('system_alert', { message, data });
    } catch (error) {
      this.logger.error(`❌ System alert error: ${(error as any).message}`);
    }
  }

  getConnectedUsersCount(): number {
    const mobileCount = this.mobileGateway.getConnectedUsersCount();
    const webCount = this.webGateway.getConnectedCount();
    return mobileCount + webCount;
  }

  getConnectedAdminsCount(): number {
    if (!this.adminGateway) {
      return 0;
    }
    return this.adminGateway.getConnectedAdminsCount();
  }

  isUserOnline(userId: string): boolean {
    // Check both mobile and web
    const isMobileOnline = this.mobileGateway.isUserOnline(userId);
    const isWebOnline =
      this.webGateway.isUserConnected(userId, 'user') || this.webGateway.isUserConnected(userId, 'astrologer');
    return isMobileOnline || isWebOnline;
  }

  isAnyAdminOnline(): boolean {
    if (!this.adminGateway) {
      return false;
    }
    return this.adminGateway.getConnectedAdminsCount() > 0;
  }
}
