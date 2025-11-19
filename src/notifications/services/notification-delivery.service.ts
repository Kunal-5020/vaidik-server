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

    let fcmTokens: string[] = [];
    if (targetDeviceId) {
      const device = recipient.devices.find((d: any) => d.deviceId === targetDeviceId && d.isActive);
      if (!device) {
        this.logger.log(`ℹ️ Target device ${targetDeviceId} not found or inactive for ${recipientId}`);
      } else {
        this.mobileGateway.sendToUserDevice(recipientId, targetDeviceId, notification);
        if (device.fcmToken) fcmTokens.push(device.fcmToken);
      }
    } else if (targetFcmToken) {
      fcmTokens = [targetFcmToken];
    } else {
      fcmTokens = recipient.devices.filter((d: any) => d.isActive).map((d: any) => d.fcmToken).filter(Boolean);
      this.mobileGateway.sendToUser(recipientId, notification);
    }

    if (fcmTokens.length === 0) {
      this.logger.log(`⏭️ No FCM tokens available for user ${recipientId} with specified criteria`);
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
    if (notification.actionUrl) {
      fcmData['actionUrl'] = notification.actionUrl;
    }

    const validImageUrl = this.isValidUrl(notification.imageUrl) ? notification.imageUrl : undefined;
    
    // Check if this is a full-screen notification
    const isFullScreen = notification.data?.fullScreen === true || notification.data?.fullScreen === 'true';

    const fcmResult = await this.fcmService.sendToMultipleDevices(
      fcmTokens,
      notification.title,
      notification.message,
      fcmData,
      validImageUrl,
      isFullScreen // Pass the fullScreen flag to FCM
    );

    if (fcmResult.successCount > 0) {
      notification.isPushSent = true;
      notification.pushSentAt = new Date();
      await notification.save();
      this.logger.log(`✅ Notification delivered to ${recipientId}: FCM=${fcmResult.successCount}/${fcmTokens.length} devices (fullScreen: ${isFullScreen})`);
    } else {
      this.logger.warn(`❌ FCM failed for all ${fcmTokens.length} tokens`);
    }
  } catch (error) {
    this.logger.error(`❌ Mobile delivery error: ${(error as any).message}`);
  }
}

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
      this.logger.log(`✅ Admin notification sent: ${notification.type}`);
    } catch (error) {
      this.logger.error(`❌ Admin delivery error: ${(error as any).message}`);
    }
  }

  sendRealtimeEventToAdmins(eventType: string, eventData: any): void {
    try {
      this.adminGateway.sendRealtimeEvent(eventType, eventData);
    } catch (error) {
      this.logger.error(`❌ Realtime event error: ${(error as any).message}`);
    }
  }

  broadcastSystemAlert(message: string, data?: any): void {
    try {
      this.adminGateway.broadcastSystemAlert({ message, data });
    } catch (error) {
      this.logger.error(`❌ System alert error: ${(error as any).message}`);
    }
  }

  getConnectedUsersCount(): number {
    return this.mobileGateway.getConnectedUsersCount();
  }

  getConnectedAdminsCount(): number {
    return this.adminGateway.getConnectedAdminsCount();
  }

  isUserOnline(userId: string): boolean {
    return this.mobileGateway.isUserOnline(userId);
  }

  isAnyAdminOnline(): boolean {
    return this.adminGateway.isAnyAdminOnline();
  }
}
