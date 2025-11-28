// src/notifications/services/notification-delivery.service.ts
import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common'; // ✅ Add Inject and forwardRef
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MobileNotificationGateway } from '../gateways/mobile-notification.gateway';
import { FcmService } from './fcm.service';
import { Notification, NotificationDocument } from '../schemas/notification.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { getNotificationConfig, shouldUseSocketIo } from '../config/notification-types.config';


// ✅ Regular import (not type-only) since we're using Inject
import { AdminNotificationGateway } from '../../admin/features/notifications/gateways/admin-notification.gateway';

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private mobileGateway: MobileNotificationGateway,
    @Inject(forwardRef(() => AdminNotificationGateway)) // ✅ Use Inject with forwardRef
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

  async deliverToMobile(
  notification: NotificationDocument,
  targetDeviceId?: string,
  targetFcmToken?: string
): Promise<void> {
  try {
    const recipientId = notification.recipientId.toString();

    // 🆕 GET notification type configuration
    const typeConfig = getNotificationConfig(notification.type);

    let recipient;
    if (notification.recipientModel === 'User') {
      recipient = await this.userModel.findById(recipientId).select('devices').lean().exec();
    } else {
      recipient = await this.astrologerModel.findById(recipientId).select('devices').lean().exec();
    }

    if (!recipient?.devices?.length) {
      this.logger.log(`⏭️ No devices for ${notification.recipientModel} ${recipientId}`);
      return;
    }

    // 🎯 HYBRID DELIVERY: Try Socket.io for real-time types first
    const useSocketIo = shouldUseSocketIo(notification.type);
    let socketSent = false;

    if (useSocketIo && this.mobileGateway.isUserOnline(recipientId)) {
      if (targetDeviceId) {
        socketSent = this.mobileGateway.sendToUserDevice(recipientId, targetDeviceId, notification);
      } else {
        socketSent = this.mobileGateway.sendToUser(recipientId, notification);
      }

      if (socketSent) {
        this.logger.log(`⚡ Instant Socket.io delivery: ${notification.type} to ${recipientId}`);
        notification.isSocketSent = true;
        notification.socketSentAt = new Date();
        await notification.save();
        
        // For chat/messages, if socket delivery succeeded, we're done
        // They'll get in-app banner, no need for FCM push
        return;
      }
    }

    // 📤 FCM DELIVERY: If not real-time type OR Socket.io failed
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

    // 🆕 BUILD FCM data with behavior flags
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

    // 🆕 SEND via FCM with type configuration
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
        `✅ FCM delivery: ${notification.type} to ${recipientId} | ` +
        `Success: ${fcmResult.successCount}/${fcmTokens.length} | ` +
        `Priority: ${typeConfig.priority} | FullScreen: ${typeConfig.isFullScreen}`
      );
    } else {
      this.logger.warn(`❌ FCM failed for all ${fcmTokens.length} tokens`);
    }
  } catch (error) {
    this.logger.error(`❌ Mobile delivery error: ${(error as any).message}`);
  }
}


  // ✅ Fixed method name and null check
  async deliverToAdmins(notification: NotificationDocument): Promise<void> {
    if (!this.adminGateway) {
      this.logger.debug('AdminNotificationGateway not available, skipping admin delivery');
      return;
    }

    try {
      // ✅ Use broadcastToAllAdmins instead of sendToAllAdmins
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

  // ✅ Use broadcastToAllAdmins
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

  // ✅ Use broadcastToAllAdmins
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
    return this.mobileGateway.getConnectedUsersCount();
  }

  getConnectedAdminsCount(): number {
    if (!this.adminGateway) {
      return 0;
    }
    return this.adminGateway.getConnectedAdminsCount();
  }

  isUserOnline(userId: string): boolean {
    return this.mobileGateway.isUserOnline(userId);
  }

  // ✅ Remove this method since it doesn't exist in AdminNotificationGateway
  // Or check the gateway for available methods
  isAnyAdminOnline(): boolean {
    if (!this.adminGateway) {
      return false;
    }
    // Use getConnectedAdminsCount instead
    return this.adminGateway.getConnectedAdminsCount() > 0;
  }
}
