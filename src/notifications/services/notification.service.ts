// notifications/services/notification.service.ts (ENHANCED)
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification, NotificationDocument } from '../schemas/notification.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { NotificationDeliveryService } from './notification-delivery.service';

@Injectable()
export class NotificationService {
  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private deliveryService: NotificationDeliveryService,
  ) {}

  // ✅ Main method: Create and send notification (hybrid delivery)
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

    // 1. Create notification in database
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
      isSocketSent: false,
      isBroadcast: false,
      createdAt: new Date(),
    });

    await notification.save();

    // 2. Get FCM token
    let fcmToken: string | undefined;
    if (data.recipientModel === 'User') {
      const user = await this.userModel.findById(data.recipientId).select('fcmToken').lean();
      fcmToken = user?.fcmToken;
    } else {
      const astrologer = await this.astrologerModel.findById(data.recipientId).select('fcmToken').lean();
      fcmToken = astrologer?.fcmToken;
    }

    // 3. Deliver via hybrid system (Socket.io + FCM) - non-blocking
    this.deliveryService.deliverToMobile(notification, fcmToken).catch(err => {
      console.error('Delivery failed:', err);
    });

    // 4. Notify admin portal - non-blocking
    this.deliveryService.deliverToAdmins(notification).catch(err => {
      console.error('Admin notification failed:', err);
    });

    return notification;
  }

  // ✅ Broadcast to all users
  async broadcastToAllUsers(data: {
    type: string;
    title: string;
    message: string;
    data?: Record<string, any>;
    imageUrl?: string;
    actionUrl?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  }): Promise<{ sent: number; failed: number }> {
    // Get all users with FCM tokens
    const users = await this.userModel.find({ fcmToken: { $exists: true, $ne: null } }).select('_id fcmToken').lean();

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      try {
        await this.sendNotification({
          recipientId: user._id.toString(),
          recipientModel: 'User',
          ...data,
        });
        sent++;
      } catch (error) {
        failed++;
        console.error(`Failed to send to user ${user._id}:`, error);
      }
    }

    // Notify admins about broadcast completion
    this.deliveryService.sendRealtimeEventToAdmins('broadcast_complete', {
      sent,
      failed,
      totalUsers: users.length,
      broadcastType: data.type,
    });

    return { sent, failed };
  }

  // ✅ Broadcast to specific users
  async broadcastToUsers(
    userIds: string[],
    data: {
      type: string;
      title: string;
      message: string;
      data?: Record<string, any>;
      imageUrl?: string;
      actionUrl?: string;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
    }
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;

    for (const userId of userIds) {
      try {
        await this.sendNotification({
          recipientId: userId,
          recipientModel: 'User',
          ...data,
        });
        sent++;
      } catch (error) {
        failed++;
        console.error(`Failed to send to user ${userId}:`, error);
      }
    }

    return { sent, failed };
  }

  // ✅ Notify astrologer's followers (livestream use case)
  async notifyFollowers(astrologerId: string, data: {
    type: 'stream_started' | 'stream_reminder';
    title: string;
    message: string;
    data?: Record<string, any>;
    imageUrl?: string;
    actionUrl?: string;
  }): Promise<{ sent: number; failed: number }> {
    // Option B: Query users who follow this astrologer
    const followers = await this.userModel
      .find({ followedAstrologers: astrologerId })
      .select('_id')
      .lean();

    if (followers.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const followerIds = followers.map(f => f._id.toString());

    // Get astrologer details for notification
    const astrologer = await this.astrologerModel.findById(astrologerId).lean();

    return this.broadcastToUsers(followerIds, {
      type: data.type,
      title: data.title,
      message: data.message,
      data: {
        ...data.data,
        astrologerId,
        astrologerName: astrologer?.name,
      },
      imageUrl: data.imageUrl || astrologer?.profilePicture, // ✅ FIXED: Use profilePicture
      actionUrl: data.actionUrl,
      priority: 'high', // Livestream notifications are high priority
    });
  }

  // ✅ Get user notifications (mobile endpoint)
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

  // ✅ Get notification stats (for admin)
  async getNotificationStats(): Promise<any> {
    const [total, unread, byType] = await Promise.all([
      this.notificationModel.countDocuments(),
      this.notificationModel.countDocuments({ isRead: false }),
      this.notificationModel.aggregate([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return {
      total,
      unread,
      byType,
      connectedUsers: this.deliveryService.getConnectedUsersCount(),
      connectedAdmins: this.deliveryService.getConnectedAdminsCount(),
    };
  }
}
