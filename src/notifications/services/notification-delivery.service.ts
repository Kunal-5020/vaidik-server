// src/notifications/services/notification-delivery.service.ts (COMPLETE - UPDATED)
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MobileNotificationGateway } from '../gateways/mobile-notification.gateway';
import { AdminNotificationGateway } from '../../admin/gateways/admin-notification.gateway';
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

  // ✅ Validate and clean imageUrl
  private isValidUrl(urlString?: string): boolean {
    try {
      if (!urlString || typeof urlString !== 'string') {
        return false;
      }

      const trimmed = urlString.trim();
      if (trimmed === '') {
        return false;
      }

      new URL(trimmed);
      return true;
    } catch (error) {
      return false;
    }
  }

  // ✅ Main delivery method - hybrid (Socket.io + FCM)
  async deliverToMobile(notification: NotificationDocument): Promise<void> {
    try {
      const recipientId = notification.recipientId.toString();

      // Get user/astrologer with devices
      const model = (
        notification.recipientModel === 'User' ? this.userModel : this.astrologerModel
      ) as Model<UserDocument | AstrologerDocument>;

      const recipient = await model
        .findById(recipientId)
        .select('devices')
        .lean()
        .exec() as any;

      if (!recipient || !recipient.devices || recipient.devices.length === 0) {
        this.logger.log(`⏭️ No devices for ${notification.recipientModel} ${recipientId}`);
        return;
      }

      // Separate by status
      const activeDevices = recipient.devices.filter((d: any) => d.isActive);
      const fcmTokens = activeDevices.map((d: any) => d.fcmToken).filter(Boolean);

      if (fcmTokens.length === 0) {
        this.logger.log(`⏭️ No FCM tokens for ${recipientId}`);
        return;
      }

      // Prepare data for FCM
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

      // ✅ Only pass valid imageUrl
      const validImageUrl = this.isValidUrl(notification.imageUrl)
        ? notification.imageUrl
        : undefined;

      // Send via FCM
      this.logger.log(`📤 Sending FCM to ${fcmTokens.length} devices for user ${recipientId}`);

      const fcmResult = await this.fcmService.sendToMultipleDevices(
        fcmTokens,
        notification.title,
        notification.message,
        fcmData,
        validImageUrl
      );

      if (fcmResult.successCount > 0) {
        notification.isPushSent = true;
        notification.pushSentAt = new Date();
        await notification.save();

        this.logger.log(
          `✅ Notification delivered to ${recipientId}: FCM=${fcmResult.successCount}/${fcmTokens.length} devices`
        );
      } else {
        this.logger.warn(`❌ FCM failed for all ${fcmTokens.length} tokens`);
      }
    } catch (error) {
      this.logger.error(`❌ Mobile delivery error: ${(error as any).message}`);
    }
  }

  // ✅ Deliver to admin portal via Socket.io
  async deliverToAdmins(notification: NotificationDocument): Promise<void> {
    try {
      this.adminGateway.sendToAllAdmins({
        notificationId: notification.notificationId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        recipientId: notification.recipientId.toString(),
        recipientModel: notification.recipientModel,
        timestamp: notification.createdAt,
      });

      this.logger.log(
        `✅ Admin notification sent: ${notification.type}`
      );
    } catch (error) {
      this.logger.error(`❌ Admin delivery error: ${(error as any).message}`);
    }
  }

  // ✅ Send realtime event to admins
  sendRealtimeEventToAdmins(eventType: string, eventData: any): void {
    try {
      this.adminGateway.sendRealtimeEvent(eventType, eventData);
    } catch (error) {
      this.logger.error(`❌ Realtime event error: ${(error as any).message}`);
    }
  }

  // ✅ Broadcast system alert to admins
  broadcastSystemAlert(message: string, data?: any): void {
    try {
      this.adminGateway.broadcastSystemAlert({ message, data });
    } catch (error) {
      this.logger.error(`❌ System alert error: ${(error as any).message}`);
    }
  }

  // ✅ Get connected users count
  getConnectedUsersCount(): number {
    return this.mobileGateway.getConnectedUsersCount();
  }

  // ✅ Get connected admins count
  getConnectedAdminsCount(): number {
    return this.adminGateway.getConnectedAdminsCount();
  }

  // ✅ Check if user is online
  isUserOnline(userId: string): boolean {
    return this.mobileGateway.isUserOnline(userId);
  }

  // ✅ Check if any admin is online
  isAnyAdminOnline(): boolean {
    return this.adminGateway.isAnyAdminOnline();
  }
}
