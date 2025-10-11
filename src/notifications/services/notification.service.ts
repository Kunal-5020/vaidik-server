import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification, NotificationDocument } from '../schemas/notification.schema';
import { FcmService } from './fcm.service';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private fcmService: FcmService,
  ) {}

  // ✅ Create and send notification (all in one)
  async sendNotification(data: {
    recipientId: string;
    recipientModel: 'User' | 'Astrologer';
    type: string;
    title: string;
    message: string;
    data?: Record<string, any>;
    imageUrl?: string;
    actionUrl?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  }): Promise<NotificationDocument> {
    const notificationId = `NOTIF_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    // Create in-app notification
    const notification = new this.notificationModel({
      notificationId,
      recipientId: data.recipientId,
      recipientModel: data.recipientModel,
      type: data.type,
      title: data.title,
      message: data.message,
      data: data.data,
      imageUrl: data.imageUrl,
      actionUrl: data.actionUrl,
      priority: data.priority || 'medium',
      isRead: false,
      isPushSent: false,
      createdAt: new Date(),
    });

    await notification.save();

    // Send push notification in background (don't await)
    this.sendPushNotification(notification).catch(err => {
      console.error('Push notification failed:', err);
    });

    return notification;
  }

  // ✅ Send push notification
  private async sendPushNotification(notification: NotificationDocument): Promise<void> {
    try {
      // Get FCM token
      let fcmToken: string | undefined;

      if (notification.recipientModel === 'User') {
        const user = await this.userModel.findById(notification.recipientId).select('fcmToken');
        fcmToken = user?.fcmToken;
      } else {
        const astrologer = await this.astrologerModel.findById(notification.recipientId).select('fcmToken');
        fcmToken = astrologer?.fcmToken;
      }

      if (!fcmToken) {
        console.log('No FCM token available for recipient');
        return;
      }

      // Convert data to string format for FCM
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

      // Send push
      const result = await this.fcmService.sendToDevice(
        fcmToken,
        notification.title,
        notification.message,
        fcmData,
        notification.imageUrl
      );

      // Update notification
      if (result.success) {
        notification.isPushSent = true;
        notification.pushSentAt = new Date();
        await notification.save();
      }
    } catch (error) {
      console.error('Error sending push:', error);
    }
  }

  // ✅ Get user notifications
  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    unreadOnly: boolean = false
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = { recipientId: userId };

    if (unreadOnly) {
      query.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.notificationModel.countDocuments(query),
      this.notificationModel.countDocuments({ recipientId: userId, isRead: false }),
    ]);

    return {
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  // ✅ Mark as read
  async markAsRead(notificationIds: string[]): Promise<void> {
    await this.notificationModel.updateMany(
      { notificationId: { $in: notificationIds }, isRead: false },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );
  }

  // ✅ Mark all as read
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationModel.updateMany(
      { recipientId: userId, isRead: false },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );
  }

  // ✅ Delete notification
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    await this.notificationModel.deleteOne({ notificationId, recipientId: userId });
  }

  // ✅ Clear all notifications
  async clearAllNotifications(userId: string): Promise<void> {
    await this.notificationModel.deleteMany({ recipientId: userId });
  }

  // ✅ Get unread count
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({ recipientId: userId, isRead: false });
  }
}
