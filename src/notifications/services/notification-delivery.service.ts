// src/notifications/services/notification-delivery.service.ts
import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { NotificationGateway } from '../gateways/notification.gateway';
import { FcmService } from './fcm.service';
import { Notification, NotificationDocument } from '../schemas/notification.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { getNotificationConfig, shouldUseSocketIo } from '../config/notification-types.config';
import { ChatGateway } from '../../chat/gateways/chat.gateway';
import { AdminNotificationGateway } from '../../admin/features/notifications/gateways/admin-notification.gateway';

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,

    // Unified gateway (mobile + web)
    @Inject(forwardRef(() => NotificationGateway))
    private readonly notificationGateway: NotificationGateway,

    @Inject(forwardRef(() => ChatGateway)) 
    private readonly chatGateway: ChatGateway,

    @Inject(forwardRef(() => AdminNotificationGateway))
    private readonly adminGateway: AdminNotificationGateway | undefined,

    private readonly fcmService: FcmService,
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
   * Deliver to WEB (socket) + MOBILE (socket) + fallback FCM
   * (Method name kept as-is to avoid touching other callers.)
   */
  async deliverToMobile(
    notification: NotificationDocument,
    targetDeviceId?: string,
    targetFcmToken?: string,
  ): Promise<void> {
    try {
      const recipientId = notification.recipientId.toString();
      const typeConfig = getNotificationConfig(notification.type);

      // 1) Fetch recipient device data (for FCM fallback)
      const recipient =
        notification.recipientModel === 'User'
          ? await this.userModel.findById(recipientId).select('devices').lean().exec()
          : await this.astrologerModel.findById(recipientId).select('devices').lean().exec();

      if (!recipient) {
        this.logger.warn(`⚠️ Recipient not found: ${notification.recipientModel} ${recipientId}`);
        return;
      }

      // ============================================================
      // 🌐 CHANNEL 1: WEB SOCKETS (via unified gateway)
      // ============================================================
      const userType = notification.recipientModel === 'User' ? 'user' : 'astrologer';

      const isWebConnected = this.notificationGateway.isUserConnected(recipientId, userType);

      if (isWebConnected) {
        this.notificationGateway.sendToWebUser(recipientId, userType, 'notification', {
          notificationId: notification.notificationId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          imageUrl: notification.imageUrl,
          actionUrl: notification.actionUrl,
          priority: notification.priority || typeConfig.priority,
          timestamp: notification.createdAt,
        });
        this.logger.log(`🌐 [Web] Sent to ${userType} ${recipientId}`);
      }

      // ============================================================
      // 📱 CHANNEL 2: MOBILE SOCKETS (via unified gateway)
      // ============================================================
      const useSocketIo = shouldUseSocketIo(notification.type);
      let isMobileSocketSent = false;

      if (useSocketIo && this.notificationGateway.isUserOnline(recipientId)) {
        if (targetDeviceId) {
          isMobileSocketSent = this.notificationGateway.sendToUserDevice(
            recipientId,
            targetDeviceId,
            notification,
          );
        } else {
          isMobileSocketSent = this.notificationGateway.sendToUser(recipientId, notification);
        }

        if (isMobileSocketSent) {
          this.logger.log(`⚡ [Mobile Socket] Delivered: ${notification.type} to ${recipientId}`);
        }
      }

      // If any socket channel worked, mark socket sent and stop (your existing behavior)
      if (isWebConnected || isMobileSocketSent) {
        await this.notificationModel.updateOne(
          { _id: notification._id },
          { $set: { isSocketSent: true, socketSentAt: new Date() } },
        );
        return;
      }

      // ============================================================
      // 📤 CHANNEL 3: FCM (fallback)
      // ============================================================
      if (!recipient.devices || recipient.devices.length === 0) return;

      let fcmTokens: string[] = [];

      if (targetDeviceId) {
        const device = recipient.devices.find((d: any) => d.deviceId === targetDeviceId && d.isActive);
        if (device?.fcmToken) fcmTokens.push(device.fcmToken);
      } else if (targetFcmToken) {
        fcmTokens = [targetFcmToken];
      } else {
        fcmTokens = recipient.devices
          .filter((d: any) => d.isActive && d.fcmToken)
          .map((d: any) => d.fcmToken);
      }

      if (fcmTokens.length === 0) {
        this.logger.debug(`⏭️ No valid FCM tokens for ${recipientId}, skipping Push.`);
        return;
      }

      const fcmData: Record<string, string> = {};
      if (notification.data) {
        for (const [key, value] of Object.entries(notification.data)) {
          fcmData[key] = String(value);
        }
      }
      fcmData['notificationId'] = notification.notificationId;
      fcmData['type'] = notification.type;

      const fcmResult = await this.fcmService.sendToMultipleDevices(
        fcmTokens,
        notification.title,
        notification.message,
        fcmData,
        this.isValidUrl(notification.imageUrl) ? notification.imageUrl : undefined,
        {
          isFullScreen: typeConfig.isFullScreen,
          priority: typeConfig.priority,
          sound: typeConfig.sound,
          channelId: typeConfig.androidChannelId,
          badge: 1,
        },
      );

      if (fcmResult.successCount > 0) {
        await this.notificationModel.updateOne(
          { _id: notification._id },
          { $set: { isPushSent: true, pushSentAt: new Date() } },
        );
        this.logger.log(`✅ [FCM] Sent to ${recipientId} (${fcmResult.successCount} devices)`);
      }
    } catch (error: any) {
      this.logger.error(`❌ Delivery Failed: ${error.message}`, error.stack);
    }
  }

  async deliverToAdmins(notification: NotificationDocument): Promise<void> {
    if (!this.adminGateway) return;
    try {
      this.adminGateway.broadcastToAllAdmins('notification', {
        notificationId: notification.notificationId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        recipientId: notification.recipientId,
        timestamp: notification.createdAt,
      });
    } catch (e: any) {
      this.logger.error(`Admin delivery failed: ${e.message}`);
    }
  }

  sendRealtimeEventToAdmins(eventType: string, eventData: any): void {
    if (!this.adminGateway) {
      this.logger.debug('AdminNotificationGateway not available');
      return;
    }
    try {
      this.adminGateway.broadcastToAllAdmins(eventType, eventData);
    } catch (error: any) {
      this.logger.error(`❌ Realtime event error (Type: ${eventType}): ${error.message}`, error.stack);
    }
  }

  broadcastSystemAlert(message: string, data?: any): void {
    if (!this.adminGateway) {
      this.logger.debug('AdminNotificationGateway not available');
      return;
    }
    try {
      this.adminGateway.broadcastToAllAdmins('system_alert', { message, data });
    } catch (error: any) {
      this.logger.error(`❌ System alert error (Message: ${message}): ${error.message}`, error.stack);
    }
  }

  getConnectedUsersCount(): number {
    const mobileCount = this.notificationGateway.getConnectedUsersCount();
    const webCount = this.notificationGateway.getConnectedWebCount();
    return mobileCount + webCount;
  }

  getConnectedAdminsCount(): number {
    if (!this.adminGateway) return 0;
    return this.adminGateway.getConnectedAdminsCount();
  }

  isUserOnline(userId: string): boolean {
    // Check Notification Gateway (Mobile/Web)
    const isNotifConnected = 
      this.notificationGateway.isUserOnline(userId) || 
      this.notificationGateway.isUserConnected(userId, 'user');

    // 👇 ADD Check for Chat Gateway
    // (Assuming your ChatGateway has a method like isUserOnline or you can check its connectedUsers map)
    const isChatConnected = this.chatGateway.isUserOnline(userId); 

    return isNotifConnected || isChatConnected;
  }

  isAnyAdminOnline(): boolean {
    if (!this.adminGateway) return false;
    return this.adminGateway.getConnectedAdminsCount() > 0;
  }
}
