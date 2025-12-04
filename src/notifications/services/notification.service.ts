// notifications/services/notification.service.ts (UPDATED)
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from '../schemas/notification.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { NotificationDeliveryService } from './notification-delivery.service';
import { getNotificationConfig, RefinedNotificationType } from '../config/notification-types.config';


@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectModel(Notification.name) private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private deliveryService: NotificationDeliveryService,
  ) {}

  /**
   * ✅ Main method: Create and send notification (hybrid delivery)
   * Now properly handles device token array from auth module
   */
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

    try {
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
      this.logger.log(`📝 Notification created: ${notificationId} for ${data.recipientModel} ${data.recipientId}`);

      // 2. ✅ Verify recipient exists and has devices
      const model = (
        data.recipientModel === 'User' ? this.userModel : this.astrologerModel
      ) as Model<UserDocument | AstrologerDocument>;

      const recipient = await model
        .findById(data.recipientId)
        .select('devices')
        .lean()
        .exec() as any;

      if (!recipient) {
        this.logger.warn(`⚠️ Recipient not found: ${data.recipientModel} ${data.recipientId}`);
        notification.isPushSent = false;
        await notification.save();
        return notification;
      }

      if (!recipient.devices || recipient.devices.length === 0) {
        this.logger.log(`ℹ️ No devices registered for ${data.recipientModel} ${data.recipientId}`);
        notification.isPushSent = false;
        await notification.save();
        return notification;
      }

      const activeDevices = recipient.devices.filter((d: any) => d.isActive);
      if (activeDevices.length === 0) {
        this.logger.log(`ℹ️ No active devices for ${data.recipientModel} ${data.recipientId}`);
      }

      // 3. ✅ Deliver via hybrid system (Socket.io + FCM) - non-blocking
      this.deliveryService.deliverToMobile(notification).catch(err => {
        this.logger.error('❌ Mobile delivery failed:', err.message);
      });

      // 4. Notify admin portal - non-blocking
      this.deliveryService.deliverToAdmins(notification).catch(err => {
        this.logger.error('❌ Admin delivery failed:', err.message);
      });

      return notification;
    } catch (error) {
      this.logger.error(`❌ Error sending notification: ${(error as any).message}`);
      throw error;
    }
  }

  /**
   * ✅ Broadcast to all users - UPDATED with better logging
   */
  async broadcastToAllUsers(data: {
    type: string;
    title: string;
    message: string;
    data?: Record<string, any>;
    imageUrl?: string;
    actionUrl?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  }): Promise<{ sent: number; failed: number }> {
    try {
      // ✅ Query users with at least one active device
      const users = await this.userModel
        .find({
          devices: { $exists: true, $ne: [] },
          'devices.isActive': true,
        })
        .select('_id')
        .lean()
        .exec() as any;

      this.logger.log(`📊 Broadcasting to ${users.length} users with active devices`);

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
          this.logger.error(`Failed to send to user ${user._id}: ${(error as any).message}`);
        }
      }

      // Notify admins about broadcast completion
      this.deliveryService.sendRealtimeEventToAdmins('broadcast_complete', {
        sent,
        failed,
        totalUsers: users.length,
        broadcastType: data.type,
        timestamp: new Date(),
      });

      this.logger.log(`✅ Broadcast complete: ${sent} sent, ${failed} failed`);

      return { sent, failed };
    } catch (error) {
      this.logger.error(`❌ Broadcast failed: ${(error as any).message}`);
      throw error;
    }
  }

  /**
   * ✅ Broadcast to all astrologers - UPDATED
   */
  async broadcastToAllAstrologers(data: {
    type: string;
    title: string;
    message: string;
    data?: Record<string, any>;
    imageUrl?: string;
    actionUrl?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  }): Promise<{ sent: number; failed: number }> {
    try {
      const astrologers = await this.astrologerModel
        .find({
          devices: { $exists: true, $ne: [] },
          'devices.isActive': true,
        })
        .select('_id')
        .lean()
        .exec() as any;

      this.logger.log(`📊 Broadcasting to ${astrologers.length} astrologers with active devices`);

      let sent = 0;
      let failed = 0;

      for (const astrologer of astrologers) {
        try {
          await this.sendNotification({
            recipientId: astrologer._id.toString(),
            recipientModel: 'Astrologer',
            ...data,
          });
          sent++;
        } catch (error) {
          failed++;
          this.logger.error(`Failed to send to astrologer ${astrologer._id}: ${(error as any).message}`);
        }
      }

      this.deliveryService.sendRealtimeEventToAdmins('broadcast_complete', {
        sent,
        failed,
        totalAstrologers: astrologers.length,
        broadcastType: data.type,
        timestamp: new Date(),
      });

      this.logger.log(`✅ Broadcast complete: ${sent} sent, ${failed} failed`);

      return { sent, failed };
    } catch (error) {
      this.logger.error(`❌ Broadcast to astrologers failed: ${(error as any).message}`);
      throw error;
    }
  }

  // Rest of the methods remain the same...
  // (Keep all existing methods like broadcastToUsers, notifyFollowers, etc.)

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
        this.logger.error(`Failed to send to user ${userId}: ${(error as any).message}`);
      }
    }

    return { sent, failed };
  }

  async notifyFollowers(
    astrologerId: string,
    data: {
      type: 'stream_started' | 'stream_reminder';
      title: string;
      message: string;
      data?: Record<string, any>;
      imageUrl?: string;
      actionUrl?: string;
    }
  ): Promise<{ sent: number; failed: number }> {
    try {
      const followers = await this.userModel
        .find({ favoriteAstrologers: astrologerId })
        .select('_id')
        .lean()
        .exec() as any;

      if (followers.length === 0) {
        this.logger.log(`ℹ️ No followers found for astrologer ${astrologerId}`);
        return { sent: 0, failed: 0 };
      }

      const followerIds = followers.map(f => f._id.toString());

      const astrologer = await this.astrologerModel
        .findById(astrologerId)
        .lean()
        .exec() as any;

      return this.broadcastToUsers(followerIds, {
        type: data.type,
        title: data.title,
        message: data.message,
        data: {
          ...data.data,
          astrologerId,
          astrologerName: astrologer?.name,
        },
        imageUrl: data.imageUrl || astrologer?.profilePicture,
        actionUrl: data.actionUrl,
        priority: 'high',
      });
    } catch (error) {
      this.logger.error(`❌ Notify followers failed: ${(error as any).message}`);
      throw error;
    }
  }

async getUserNotifications(
  userId: string,
  page: number = 1,
  limit: number = 20,
  unreadOnly: boolean = false
): Promise<any> {
  const skip = (page - 1) * limit;
  
  // ✅ Query both string AND ObjectId formats
  const query: any = {
    $or: [
      { recipientId: userId },  // String format
      { recipientId: new Types.ObjectId(userId) }  // ObjectId format
    ]
  };

  if (unreadOnly) {
    query.isRead = false;
  }

  this.logger.log(`📊 Query with $or: userId=${userId}, page=${page}, limit=${limit}`);

  try {
    const [notifications, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.notificationModel.countDocuments(query),
      this.notificationModel.countDocuments({ 
        $or: [
          { recipientId: userId, isRead: false },
          { recipientId: new Types.ObjectId(userId), isRead: false }
        ]
      }),
    ]);

    this.logger.log(`✅ Found ${notifications.length} notifications (Total: ${total}, Unread: ${unreadCount})`);

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
  } catch (error) {
    this.logger.error(`❌ Error fetching notifications: ${error.message}`);
    throw error;
  }
}


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

 async markAllAsRead(userId: string): Promise<void> {
    let recipientId: any = userId;
    
    if (Types.ObjectId.isValid(userId)) {
      recipientId = new Types.ObjectId(userId);
    }

    await this.notificationModel.updateMany(
      { recipientId, isRead: false },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );
  }

  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    let recipientId: any = userId;
    
    if (Types.ObjectId.isValid(userId)) {
      recipientId = new Types.ObjectId(userId);
    }

    await this.notificationModel.deleteOne({ 
      notificationId, 
      recipientId 
    });
  }

 async clearAllNotifications(userId: string): Promise<void> {
    let recipientId: any = userId;
    
    if (Types.ObjectId.isValid(userId)) {
      recipientId = new Types.ObjectId(userId);
    }

    await this.notificationModel.deleteMany({ recipientId });
  }

  async getUnreadCount(userId: string): Promise<number> {
    let recipientId: any = userId;
    
    if (Types.ObjectId.isValid(userId)) {
      recipientId = new Types.ObjectId(userId);
    }

    return this.notificationModel.countDocuments({ 
      recipientId, 
      isRead: false 
    });
  }

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
      timestamp: new Date(),
    };
  }

  async getConnectionStats(): Promise<any> {
    return {
      connectedUsers: this.deliveryService.getConnectedUsersCount(),
      connectedAdmins: this.deliveryService.getConnectedAdminsCount(),
      timestamp: new Date(),
    };
  }

  // ========================================
// 🆕 REFINED NOTIFICATION TYPE METHODS
// ========================================

/**
 * Send Call Notification (Video/Audio)
 */
async sendCallNotification(data: {
  recipientId: string;
  recipientModel: 'User' | 'Astrologer';
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  isVideo: boolean;
  callId: string;
  roomId?: string;
}): Promise<NotificationDocument> {
  const type = data.isVideo ? RefinedNotificationType.CALL_VIDEO : RefinedNotificationType.CALL_AUDIO;
  const config = getNotificationConfig(type);

  return this.sendNotification({
    recipientId: data.recipientId,
    recipientModel: data.recipientModel,
    type,
    title: data.callerName,
    message: data.isVideo ? 'Incoming video call...' : 'Incoming voice call...',
    data: {
      callId: data.callId,
      callerId: data.callerId,
      callerName: data.callerName,
      callerAvatar: data.callerAvatar,
      isVideo: data.isVideo,
      roomId: data.roomId,
      fullScreen: true,
    },
    imageUrl: data.callerAvatar,
    priority: config.priority,
  });
}

/**
 * Send Message Notification
 */
async sendMessageNotification(data: {
  recipientId: string;
  recipientModel: 'User' | 'Astrologer';
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  messageText: string;
  chatId: string;
  messageId: string;
}): Promise<NotificationDocument> {
  const config = getNotificationConfig(RefinedNotificationType.MESSAGE_DIRECT);

  return this.sendNotification({
    recipientId: data.recipientId,
    recipientModel: data.recipientModel,
    type: RefinedNotificationType.MESSAGE_DIRECT,
    title: data.senderName,
    message: data.messageText,
    data: {
      senderId: data.senderId,
      senderName: data.senderName,
      senderAvatar: data.senderAvatar,
      chatId: data.chatId,
      messageId: data.messageId,
    },
    imageUrl: data.senderAvatar,
    actionUrl: `vaidiktalk://chat/${data.chatId}`,
    priority: config.priority,
  });
}

/**
 * Send Chat Notification (Group)
 */
async sendChatNotification(data: {
  recipientId: string;
  recipientModel: 'User' | 'Astrologer';
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  messageText: string;
  chatId: string;
  groupName?: string;
}): Promise<NotificationDocument> {
  const config = getNotificationConfig(RefinedNotificationType.CHAT_GROUP);

  return this.sendNotification({
    recipientId: data.recipientId,
    recipientModel: data.recipientModel,
    type: RefinedNotificationType.CHAT_GROUP,
    title: data.groupName || data.senderName,
    message: `${data.senderName}: ${data.messageText}`,
    data: {
      senderId: data.senderId,
      senderName: data.senderName,
      chatId: data.chatId,
      groupName: data.groupName,
    },
    imageUrl: data.senderAvatar,
    actionUrl: `vaidiktalk://chat/${data.chatId}`,
    priority: config.priority,
  });
}

/**
 * Send Live Event Notification
 */
async sendLiveEventNotification(data: {
  recipientId: string;
  recipientModel: 'User' | 'Astrologer';
  eventId: string;
  eventName: string;
  eventType: 'started' | 'reminder';
  eventStartTime?: Date;
  astrologerId?: string;
  astrologerName?: string;
  astrologerAvatar?: string;
}): Promise<NotificationDocument> {
  const type = data.eventType === 'started' 
    ? RefinedNotificationType.LIVE_EVENT_STARTED 
    : RefinedNotificationType.LIVE_EVENT_REMINDER;
  
  const config = getNotificationConfig(type);

  return this.sendNotification({
    recipientId: data.recipientId,
    recipientModel: data.recipientModel,
    type,
    title: data.eventType === 'started' ? '🔴 Live Now!' : '⏰ Event Starting Soon',
    message: data.eventType === 'started'
      ? `${data.astrologerName || 'Astrologer'} is now live: ${data.eventName}`
      : `${data.eventName} starts in 15 minutes`,
    data: {
      eventId: data.eventId,
      eventName: data.eventName,
      eventType: data.eventType,
      astrologerId: data.astrologerId,
      astrologerName: data.astrologerName,
      eventStartTime: data.eventStartTime?.toISOString(),
    },
    imageUrl: data.astrologerAvatar,
    actionUrl: `vaidiktalk://event/${data.eventId}`,
    priority: config.priority,
  });
}

/**
 * Send System/Promotional Notification
 */
async sendSystemNotification(data: {
  recipientId: string;
  recipientModel: 'User' | 'Astrologer';
  title: string;
  message: string;
  imageUrl?: string;
  actionUrl?: string;
  data?: Record<string, any>;
}): Promise<NotificationDocument> {
  const config = getNotificationConfig(RefinedNotificationType.SYSTEM_PROMOTIONAL);

  return this.sendNotification({
    recipientId: data.recipientId,
    recipientModel: data.recipientModel,
    type: RefinedNotificationType.SYSTEM_PROMOTIONAL,
    title: data.title,
    message: data.message,
    data: data.data,
    imageUrl: data.imageUrl,
    actionUrl: data.actionUrl,
    priority: config.priority,
  });
}

/**
 * Force Logout User
 */
async forceLogoutUser(data: {
  recipientId: string;
  recipientModel: 'User' | 'Astrologer';
  reason: string;
  adminId?: string;
}): Promise<NotificationDocument> {
  const config = getNotificationConfig(RefinedNotificationType.FORCE_LOGOUT);

  // 1. Send notification
  const notification = await this.sendNotification({
    recipientId: data.recipientId,
    recipientModel: data.recipientModel,
    type: RefinedNotificationType.FORCE_LOGOUT,
    title: 'Session Ended',
    message: data.reason,
    data: {
      reason: data.reason,
      forceLogout: true,
      timestamp: new Date().toISOString(),
      adminId: data.adminId,
    },
    priority: config.priority,
  });

  // 2. Deactivate all user devices
  const model = (
    data.recipientModel === 'User' ? this.userModel : this.astrologerModel
  ) as Model<UserDocument | AstrologerDocument>;

  await model.findByIdAndUpdate(data.recipientId, {
    $set: { 'devices.$[].isActive': false },
  });

  this.logger.log(
    `🔒 Force logout: ${data.recipientModel} ${data.recipientId} | ` +
    `Reason: ${data.reason} | Admin: ${data.adminId || 'System'}`
  );

  return notification;
}

}
