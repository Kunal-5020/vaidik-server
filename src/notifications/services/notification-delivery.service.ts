// notifications/services/notification-delivery.service.ts (NEW)
import { Injectable, Logger } from '@nestjs/common';
import { MobileNotificationGateway } from '../gateways/mobile-notification.gateway';
import { AdminNotificationGateway } from '../gateways/admin-notification.gateway';
import { FcmService } from './fcm.service';
import { Notification, NotificationDocument } from '../schemas/notification.schema';

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private mobileGateway: MobileNotificationGateway,
    private adminGateway: AdminNotificationGateway,
    private fcmService: FcmService,
  ) {}

  // Smart delivery: Socket.io first, FCM fallback
  async deliverToMobile(
    notification: NotificationDocument,
    fcmToken?: string
  ): Promise<{ socket: boolean; fcm: boolean }> {
    const recipientId = notification.recipientId.toString();
    const result = { socket: false, fcm: false };

    // 1. Try Socket.io first (if user is online)
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
      await notification.save();
      this.logger.log(`✅ Socket.io delivery successful for user ${recipientId}`);
    }

    // 2. Always send FCM (works when app closed/background)
    if (fcmToken) {
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

      const fcmResult = await this.fcmService.sendToDevice(
        fcmToken,
        notification.title,
        notification.message,
        fcmData,
        notification.imageUrl
      );

      if (fcmResult.success) {
        result.fcm = true;
        notification.isPushSent = true;
        notification.pushSentAt = new Date();
        await notification.save();
        this.logger.log(`✅ FCM delivery successful for user ${recipientId}`);
      }
    }

    return result;
  }

  // Deliver to admin portal (Socket.io only)
  async deliverToAdmins(notification: NotificationDocument): Promise<void> {
    // Check if notification should be sent to admins
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
    // High priority always goes to admin
    if (notification.priority === 'high' || notification.priority === 'urgent') {
      return true;
    }

    // Specific types that admins need to see
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
