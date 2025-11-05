// src/notifications/services/notification-delivery.service.ts (FIXED)
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MobileNotificationGateway } from '../gateways/mobile-notification.gateway';
import { AdminNotificationGateway } from '../gateways/admin-notification.gateway';
import { FcmService } from './fcm.service';
import { Notification, NotificationDocument } from '../schemas/notification.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private mobileGateway: MobileNotificationGateway,
    private adminGateway: AdminNotificationGateway,
    private fcmService: FcmService,
  ) {}

  /**
   * Deliver to ALL user devices (UPDATED for multi-device)
   */
  async deliverToMobile(
    notification: NotificationDocument,
  ): Promise<{ socket: boolean; fcm: number }> {
    const recipientId = notification.recipientId.toString();
    const result = { socket: false, fcm: 0 };

    // 1. Try Socket.io first
    const socketSent = this.mobileGateway.sendToUser(recipientId, {
      notificationId: notification.notificationId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      imageUrl: notification.imageUrl,
      actionUrl: notification.actionUrl,
      priority: notification.priority,
      timestamp: notification.createdAt,
    });

    if (socketSent) {
      result.socket = true;
      notification.isSocketSent = true;
      notification.socketSentAt = new Date();
    }

    // 2. Get ALL active devices for this user
    const model = (
      notification.recipientModel === 'User' ? this.userModel : this.astrologerModel
    ) as Model<UserDocument | AstrologerDocument>;

    // ✅ Use exec() to resolve the query
    const user = await model
      .findById(recipientId)
      .select('devices')
      .lean()
      .exec() as any;

    if (!user || !user.devices || user.devices.length === 0) {
      this.logger.log(`⏭️ No devices registered for user ${recipientId}`);
      await notification.save();
      return result;
    }

    // 3. Get active devices only
    const activeDevices = user.devices.filter((device: any) => device.isActive);
    const fcmTokens = activeDevices.map((device: any) => device.fcmToken);

    if (fcmTokens.length === 0) {
      this.logger.log(`⏭️ No active devices for user ${recipientId}`);
      await notification.save();
      return result;
    }

    // 4. Prepare FCM data
    const fcmData: Record<string, string> = {};
    if (notification.data) {
      for (const [key, value] of Object.entries(notification.data)) {
        fcmData[key] = String(value);
      }
    }
    fcmData['notificationId'] = notification.notificationId;
    fcmData['type'] = notification.type;
    if (notification.actionUrl) {
      fcmData['actionUrl'] = notification.actionUrl;
    }

    // 5. Send to multiple devices
    if (fcmTokens.length === 1) {
      // Single device
      const fcmResult = await this.fcmService.sendToDevice(
        fcmTokens[0],
        notification.title,
        notification.message,
        fcmData,
        notification.imageUrl
      );

      if (fcmResult.success) {
        result.fcm = 1;
      }
    } else {
      // Multiple devices - batch send
      const fcmResult = await this.fcmService.sendToMultipleDevices(
        fcmTokens,
        notification.title,
        notification.message,
        fcmData,
        notification.imageUrl
      );

      result.fcm = fcmResult.successCount;

      // Optional: Clean up failed tokens
      if (fcmResult.failureCount > 0) {
        this.logger.warn(`${fcmResult.failureCount} FCM tokens failed for user ${recipientId}`);
      }
    }

    if (result.fcm > 0) {
      notification.isPushSent = true;
      notification.pushSentAt = new Date();
    }

    await notification.save();

    this.logger.log(
      `✅ Notification delivered to user ${recipientId}: Socket=${result.socket}, FCM=${result.fcm}/${fcmTokens.length} devices`
    );

    return result;
  }

  // Deliver to admin portal (Socket.io only)
  async deliverToAdmins(notification: NotificationDocument): Promise<void> {
    const shouldNotify = this.shouldNotifyAdmins(notification);

    if (shouldNotify) {
      this.adminGateway.sendToAllAdmins({
        notificationId: notification.notificationId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        imageUrl: notification.imageUrl,
        actionUrl: notification.actionUrl,
        priority: notification.priority,
        recipientModel: notification.recipientModel,
        recipientId: notification.recipientId,
        timestamp: notification.createdAt,
      });

      this.logger.log(`✅ Admin notification sent: ${notification.type}`);
    }
  }

  // Send realtime event to admins (orders, calls, streams)
  sendRealtimeEventToAdmins(eventType: string, eventData: any): void {
    if (this.adminGateway.isAnyAdminOnline()) {
      this.adminGateway.sendRealtimeEvent(eventType, eventData);
    }
  }

  // Broadcast system alert
  broadcastSystemAlert(message: string, data?: any): void {
    this.adminGateway.broadcastSystemAlert({
      message,
      data,
      priority: 'urgent',
    });
  }

  // Determine if admins should be notified
  private shouldNotifyAdmins(notification: NotificationDocument): boolean {
    if (notification.priority === 'high' || notification.priority === 'urgent') {
      return true;
    }

    const adminNotificationTypes = [
      'payment_success',
      'order_created',
      'call_incoming',
      'astrologer_approved',
      'payout_processed',
      'admin_alert',
      'system_announcement',
    ];

    return adminNotificationTypes.includes(notification.type);
  }

  // Get online status
  isUserOnline(userId: string): boolean {
    return this.mobileGateway.isUserOnline(userId);
  }

  getConnectedUsersCount(): number {
    return this.mobileGateway.getConnectedUsersCount();
  }

  getConnectedAdminsCount(): number {
    return this.adminGateway.getConnectedAdminsCount();
  }
}
