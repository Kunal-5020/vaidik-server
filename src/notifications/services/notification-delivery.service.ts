// src/notifications/services/notification-delivery.service.ts
import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MobileNotificationGateway } from '../gateways/mobile-notification.gateway';
import { WebNotificationGateway } from '../gateways/web-notification.gateway';
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
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    
    // ✅ FIX: Use forwardRef for MobileGateway to prevent circular dependency
    @Inject(forwardRef(() => MobileNotificationGateway)) 
    private mobileGateway: MobileNotificationGateway,

    // ✅ FIX: Use forwardRef for WebGateway to prevent circular dependency
    @Inject(forwardRef(() => WebNotificationGateway)) 
    private webGateway: WebNotificationGateway,

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

      // 1. Fetch Recipient Device Data
      let recipient;
      if (notification.recipientModel === 'User') {
        recipient = await this.userModel.findById(recipientId).select('devices').lean().exec();
      } else {
        recipient = await this.astrologerModel.findById(recipientId).select('devices').lean().exec();
      }

      if (!recipient) {
        this.logger.warn(`⚠️ Recipient not found: ${notification.recipientModel} ${recipientId}`);
        return;
      }

      // ============================================================
      // 🌐 CHANNEL 1: WEB SOCKETS
      // ============================================================
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

      // ============================================================
      // 📱 CHANNEL 2: MOBILE SOCKETS
      // ============================================================
      const useSocketIo = shouldUseSocketIo(notification.type);
      let isMobileSocketSent = false;

      if (useSocketIo && this.mobileGateway.isUserOnline(recipientId)) {
        if (targetDeviceId) {
          isMobileSocketSent = this.mobileGateway.sendToUserDevice(recipientId, targetDeviceId, notification);
        } else {
          isMobileSocketSent = this.mobileGateway.sendToUser(recipientId, notification);
        }

        if (isMobileSocketSent) {
          this.logger.log(`⚡ [Mobile Socket] Delivered: ${notification.type} to ${recipientId}`);
        }
      }

      // ✅ RECURSION FIX: Use updateOne instead of save()
      // If either Web or Mobile Socket worked, we mark as socket sent.
      if (isWebConnected || isMobileSocketSent) {
        await this.notificationModel.updateOne(
          { _id: notification._id },
          { $set: { isSocketSent: true, socketSentAt: new Date() } }
        );

        // 🛑 STOP HERE if user is online (don't spam with Push Notification unless critical)
        // You can remove this return if you ALWAYS want Push Notifications.
        return; 
      }

      // ============================================================
      // 📤 CHANNEL 3: FCM (PUSH NOTIFICATION) - FALLBACK
      // ============================================================
      
      if (!recipient.devices || recipient.devices.length === 0) {
        return;
      }

      let fcmTokens: string[] = [];

      if (targetDeviceId) {
        // Target specific device
        const device = recipient.devices.find((d: any) => d.deviceId === targetDeviceId && d.isActive);
        if (device?.fcmToken) fcmTokens.push(device.fcmToken);
      } else if (targetFcmToken) {
        // Target specific token
        fcmTokens = [targetFcmToken];
      } else {
        // Broadcast to all active devices
        fcmTokens = recipient.devices
          .filter((d: any) => d.isActive && d.fcmToken)
          .map((d: any) => d.fcmToken);
      }

      if (fcmTokens.length === 0) {
        this.logger.debug(`⏭️ No valid FCM tokens for ${recipientId}, skipping Push.`);
        return;
      }

      // Prepare FCM Payload
      const fcmData: Record<string, string> = {};
      if (notification.data) {
        for (const [key, value] of Object.entries(notification.data)) {
          fcmData[key] = String(value);
        }
      }
      fcmData['notificationId'] = notification.notificationId;
      fcmData['type'] = notification.type;
      
      // Send
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
        }
      );

      if (fcmResult.successCount > 0) {
        // ✅ RECURSION FIX: Update directly in DB
        await this.notificationModel.updateOne(
          { _id: notification._id },
          { $set: { isPushSent: true, pushSentAt: new Date() } }
        );

        this.logger.log(`✅ [FCM] Sent to ${recipientId} (${fcmResult.successCount} devices)`);
      }

    } catch (error) {
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
            timestamp: notification.createdAt
        });
    } catch (e) {
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
    } catch (error) {
      this.logger.error(
        `❌ Realtime event error (Type: ${eventType}): ${(error as any).message}`,
        (error as any).stack
      );
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
      this.logger.error(
        `❌ System alert error (Message: ${message}): ${(error as any).message}`,
        (error as any).stack
      );
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