// admin/services/notification-scheduler.service.ts (NEW)
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScheduledNotification, ScheduledNotificationDocument } from '../../notifications/schemas/scheduled-notification.schema';
import { NotificationService } from '../../notifications/services/notification.service';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    @InjectModel(ScheduledNotification.name) 
    private scheduledNotificationModel: Model<ScheduledNotificationDocument>,
    @InjectModel(User.name) 
    private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) 
    private astrologerModel: Model<AstrologerDocument>,
    private notificationService: NotificationService,
  ) {}

  // ✅ Schedule a notification
  async scheduleNotification(
    adminId: string,
    data: {
      scheduledFor: Date;
      type: string;
      title: string;
      message: string;
      data?: Record<string, any>;
      imageUrl?: string;
      actionUrl?: string;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      recipientType: 'all_users' | 'all_astrologers' | 'specific_users' | 'followers';
      specificRecipients?: string[];
      astrologerId?: string;
    }
  ): Promise<ScheduledNotificationDocument> {
    const scheduleId = `SCHED_${Date.now()}_${Math.random().toString(36).substring(7).toUpperCase()}`;

    // Validate scheduled time is in future
    if (data.scheduledFor <= new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    const scheduledNotification = new this.scheduledNotificationModel({
      scheduleId,
      scheduledFor: data.scheduledFor,
      status: 'pending',
      type: data.type,
      title: data.title,
      message: data.message,
      data: data.data,
      imageUrl: data.imageUrl,
      actionUrl: data.actionUrl,
      priority: data.priority || 'medium',
      recipientType: data.recipientType,
      specificRecipients: data.specificRecipients,
      astrologerId: data.astrologerId,
      createdBy: adminId,
      createdAt: new Date(),
    });

    await scheduledNotification.save();
    this.logger.log(`📅 Notification scheduled: ${scheduleId} for ${data.scheduledFor}`);

    return scheduledNotification;
  }

  // ✅ Process scheduled notifications (runs every minute)
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledNotifications() {
    const now = new Date();

    try {
      // Find pending notifications that should be sent now
      const pendingNotifications = await this.scheduledNotificationModel.find({
        status: 'pending',
        scheduledFor: { $lte: now },
      });

      if (pendingNotifications.length === 0) {
        return;
      }

      this.logger.log(`⏰ Processing ${pendingNotifications.length} scheduled notifications`);

      for (const scheduled of pendingNotifications) {
        try {
          await this.sendScheduledNotification(scheduled);
          
          scheduled.status = 'sent';
          scheduled.sentAt = new Date();
          await scheduled.save();

          this.logger.log(`✅ Scheduled notification sent: ${scheduled.scheduleId}`);
        } catch (error) {
          this.logger.error(`❌ Failed to send scheduled notification ${scheduled.scheduleId}: ${error.message}`);
          
          scheduled.status = 'failed';
          scheduled.failureReason = error.message;
          await scheduled.save();
        }
      }
    } catch (error) {
      this.logger.error(`❌ Error processing scheduled notifications: ${error.message}`);
    }
  }

  // ✅ Send a scheduled notification
  private async sendScheduledNotification(scheduled: ScheduledNotificationDocument): Promise<void> {
    switch (scheduled.recipientType) {
      case 'all_users':
        await this.notificationService.broadcastToAllUsers({
          type: scheduled.type,
          title: scheduled.title,
          message: scheduled.message,
          data: scheduled.data,
          imageUrl: scheduled.imageUrl,
          actionUrl: scheduled.actionUrl,
          priority: scheduled.priority as any,
        });
        break;

      case 'all_astrologers':
        const astrologers = await this.astrologerModel.find().select('_id').lean();
        const astrologerIds = astrologers.map(a => a._id.toString());
        
        await this.notificationService.broadcastToUsers(astrologerIds, {
          type: scheduled.type,
          title: scheduled.title,
          message: scheduled.message,
          data: scheduled.data,
          imageUrl: scheduled.imageUrl,
          actionUrl: scheduled.actionUrl,
          priority: scheduled.priority as any,
        });
        break;

      case 'specific_users':
        if (scheduled.specificRecipients && scheduled.specificRecipients.length > 0) {
          await this.notificationService.broadcastToUsers(
            scheduled.specificRecipients.map(id => id.toString()),
            {
              type: scheduled.type,
              title: scheduled.title,
              message: scheduled.message,
              data: scheduled.data,
              imageUrl: scheduled.imageUrl,
              actionUrl: scheduled.actionUrl,
              priority: scheduled.priority as any,
            }
          );
        }
        break;

      case 'followers':
        if (scheduled.astrologerId) {
          await this.notificationService.notifyFollowers(
            scheduled.astrologerId.toString(),
            {
              type: scheduled.type as any,
              title: scheduled.title,
              message: scheduled.message,
              data: scheduled.data,
              imageUrl: scheduled.imageUrl,
              actionUrl: scheduled.actionUrl,
            }
          );
        }
        break;
    }
  }

  // ✅ Cancel scheduled notification
  async cancelScheduledNotification(scheduleId: string, adminId: string): Promise<void> {
    const scheduled = await this.scheduledNotificationModel.findOne({ 
      scheduleId, 
      status: 'pending' 
    });
    
    if (!scheduled) {
      throw new Error('Scheduled notification not found or already processed');
    }

    scheduled.status = 'cancelled';
    await scheduled.save();

    this.logger.log(`🚫 Scheduled notification cancelled by admin ${adminId}: ${scheduleId}`);
  }

  // ✅ Get all scheduled notifications
  async getScheduledNotifications(
    status?: string,
    page: number = 1,
    limit: number = 20
  ): Promise<any> {
    const skip = (page - 1) * limit;
    const query: any = {};
    
    if (status) {
      query.status = status;
    }

    const [notifications, total] = await Promise.all([
      this.scheduledNotificationModel
        .find(query)
        .sort({ scheduledFor: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.scheduledNotificationModel.countDocuments(query),
    ]);

    return {
      success: true,
      data: {
        notifications,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    };
  }

  // ✅ Get scheduled notification by ID
  async getScheduledNotificationById(scheduleId: string): Promise<ScheduledNotificationDocument> {
    const scheduled = await this.scheduledNotificationModel.findOne({ scheduleId });
    
    if (!scheduled) {
      throw new Error('Scheduled notification not found');
    }

    return scheduled;
  }

  // ✅ Get upcoming scheduled notifications (next 24 hours)
  async getUpcomingNotifications(): Promise<ScheduledNotificationDocument[]> {
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    return this.scheduledNotificationModel.find({
      status: 'pending',
      scheduledFor: { $gte: now, $lte: next24Hours },
    }).sort({ scheduledFor: 1 });
  }
}
