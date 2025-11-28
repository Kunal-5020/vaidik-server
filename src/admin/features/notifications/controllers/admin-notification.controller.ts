// src/admin/features/notifications/controllers/admin-notification.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  ValidationPipe,
} from '@nestjs/common';

import { AdminAuthGuard } from '../../../core/guards/admin-auth.guard';
import { PermissionsGuard } from '../../../core/guards/permissions.guard';
import { RequirePermissions } from '../../../core/decorators/permissions.decorator';
import { CurrentAdmin } from '../../../core/decorators/current-admin.decorator';
import { Permissions } from '../../../core/config/permissions.config';

import { NotificationService } from '../../../../notifications/services/notification.service';
import { NotificationSchedulerService } from '../services/notification-scheduler.service';
import { SendBroadcastDto } from '../dto/send-broadcast.dto';
import { ScheduleNotificationDto } from '../dto/schedule-notification.dto';
import { NotifyFollowersDto } from '../dto/notify-followers.dto';

@Controller('admin/notifications')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class AdminNotificationController {
  constructor(
    private notificationService: NotificationService,
    private notificationSchedulerService: NotificationSchedulerService,
  ) {}

  /**
   * POST /admin/notifications/broadcast/all-users
   * Broadcast notification to all users
   */
  @Post('broadcast/all-users')
  @RequirePermissions(Permissions.NOTIFICATIONS_BROADCAST)
  async broadcastToAllUsers(
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) broadcastDto: SendBroadcastDto,
  ) {
    const result = await this.notificationService.broadcastToAllUsers({
      type: broadcastDto.type as any,
      title: broadcastDto.title,
      message: broadcastDto.message,
      data: broadcastDto.data,
      imageUrl: broadcastDto.imageUrl,
      actionUrl: broadcastDto.actionUrl,
      priority: broadcastDto.priority as any,
    });

    return {
      success: true,
      message: 'Broadcast sent to all users',
      data: result,
    };
  }

  /**
   * POST /admin/notifications/broadcast/all-astrologers
   * Broadcast notification to all astrologers
   */
  @Post('broadcast/all-astrologers')
  @RequirePermissions(Permissions.NOTIFICATIONS_BROADCAST)
  async broadcastToAllAstrologers(
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) broadcastDto: SendBroadcastDto,
  ) {
    const result = await this.notificationService.broadcastToAllAstrologers({
      type: broadcastDto.type as any,
      title: broadcastDto.title,
      message: broadcastDto.message,
      data: broadcastDto.data,
      imageUrl: broadcastDto.imageUrl,
      actionUrl: broadcastDto.actionUrl,
      priority: broadcastDto.priority as any,
    });

    return {
      success: true,
      message: 'Broadcast sent to all astrologers',
      data: result,
    };
  }

  /**
   * POST /admin/notifications/broadcast/specific-users
   * Send notification to specific users
   */
  @Post('broadcast/specific-users')
  @RequirePermissions(Permissions.NOTIFICATIONS_SEND)
  async broadcastToSpecificUsers(
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) broadcastDto: SendBroadcastDto,
  ) {
    if (!broadcastDto.userIds || broadcastDto.userIds.length === 0) {
      return {
        success: false,
        message: 'No user IDs provided',
      };
    }

    const result = await this.notificationService.broadcastToUsers(
      broadcastDto.userIds,
      {
        type: broadcastDto.type as any,
        title: broadcastDto.title,
        message: broadcastDto.message,
        data: broadcastDto.data,
        imageUrl: broadcastDto.imageUrl,
        actionUrl: broadcastDto.actionUrl,
        priority: broadcastDto.priority as any,
      }
    );

    return {
      success: true,
      message: `Broadcast sent to ${broadcastDto.userIds.length} users`,
      data: result,
    };
  }

  /**
   * POST /admin/notifications/followers
   * Notify astrologer's followers
   */
  @Post('followers')
  @RequirePermissions(Permissions.NOTIFICATIONS_SEND)
  async notifyFollowers(
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) notifyDto: NotifyFollowersDto,
  ) {
    const result = await this.notificationService.notifyFollowers(
      notifyDto.astrologerId,
      {
        type: notifyDto.type as any,
        title: notifyDto.title,
        message: notifyDto.message,
        data: notifyDto.data,
        imageUrl: notifyDto.imageUrl,
        actionUrl: notifyDto.actionUrl,
      }
    );

    return {
      success: true,
      message: 'Notification sent to followers',
      data: result,
    };
  }

  /**
   * POST /admin/notifications/schedule
   * Schedule a notification
   */
  @Post('schedule')
  @RequirePermissions(Permissions.NOTIFICATIONS_BROADCAST)
  async scheduleNotification(
    @CurrentAdmin() admin: any,
    @Body(ValidationPipe) scheduleDto: ScheduleNotificationDto,
  ) {
    const scheduledNotification = await this.notificationSchedulerService.scheduleNotification(
      admin._id,
      {
        scheduledFor: new Date(scheduleDto.scheduledFor),
        type: scheduleDto.type,
        title: scheduleDto.title,
        message: scheduleDto.message,
        data: scheduleDto.data,
        imageUrl: scheduleDto.imageUrl,
        actionUrl: scheduleDto.actionUrl,
        priority: scheduleDto.priority,
        recipientType: scheduleDto.recipientType,
        specificRecipients: scheduleDto.specificRecipients,
        astrologerId: scheduleDto.astrologerId,
      }
    );

    return {
      success: true,
      message: 'Notification scheduled successfully',
      data: scheduledNotification,
    };
  }

  /**
   * GET /admin/notifications/scheduled
   * Get scheduled notifications
   */
  @Get('scheduled')
  @RequirePermissions(Permissions.NOTIFICATIONS_SEND)
  async getScheduledNotifications(
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.notificationSchedulerService.getScheduledNotifications(status, page, limit);
  }

  /**
   * GET /admin/notifications/scheduled/upcoming
   * Get upcoming scheduled notifications (next 24 hours)
   */
  @Get('scheduled/upcoming')
  @RequirePermissions(Permissions.NOTIFICATIONS_SEND)
  async getUpcomingNotifications() {
    const notifications = await this.notificationSchedulerService.getUpcomingNotifications();
    
    return {
      success: true,
      data: notifications,
    };
  }

  // ========================================
// 🆕 REFINED NOTIFICATION TYPE ENDPOINTS
// ========================================

/**
 * POST /admin/notifications/send/call
 * Send call notification to specific user
 */
@Post('send/call')
@RequirePermissions(Permissions.NOTIFICATIONS_SEND)
async sendCallNotification(
  @CurrentAdmin() admin: any,
  @Body() body: {
    recipientId: string;
    recipientModel: 'User' | 'Astrologer';
    callerId: string;
    callerName: string;
    callerAvatar?: string;
    isVideo: boolean;
    callId: string;
    roomId?: string;
  }
) {
  const notification = await this.notificationService.sendCallNotification(body);
  
  return {
    success: true,
    message: 'Call notification sent',
    data: { notificationId: notification.notificationId },
  };
}

/**
 * POST /admin/notifications/send/message
 * Send message notification
 */
@Post('send/message')
@RequirePermissions(Permissions.NOTIFICATIONS_SEND)
async sendMessageNotification(
  @CurrentAdmin() admin: any,
  @Body() body: {
    recipientId: string;
    recipientModel: 'User' | 'Astrologer';
    senderId: string;
    senderName: string;
    senderAvatar?: string;
    messageText: string;
    chatId: string;
    messageId: string;
  }
) {
  const notification = await this.notificationService.sendMessageNotification(body);
  
  return {
    success: true,
    message: 'Message notification sent',
    data: { notificationId: notification.notificationId },
  };
}

/**
 * POST /admin/notifications/send/live-event
 * Send live event notification
 */
@Post('send/live-event')
@RequirePermissions(Permissions.NOTIFICATIONS_SEND)
async sendLiveEventNotification(
  @CurrentAdmin() admin: any,
  @Body() body: {
    recipientId: string;
    recipientModel: 'User' | 'Astrologer';
    eventId: string;
    eventName: string;
    eventType: 'started' | 'reminder';
    eventStartTime?: string;
    astrologerId?: string;
    astrologerName?: string;
    astrologerAvatar?: string;
  }
) {
  const notification = await this.notificationService.sendLiveEventNotification({
    ...body,
    eventStartTime: body.eventStartTime ? new Date(body.eventStartTime) : undefined,
  });
  
  return {
    success: true,
    message: 'Live event notification sent',
    data: { notificationId: notification.notificationId },
  };
}

/**
 * POST /admin/notifications/send/system
 * Send system/promotional notification
 */
@Post('send/system')
@RequirePermissions(Permissions.NOTIFICATIONS_SEND)
async sendSystemNotification(
  @CurrentAdmin() admin: any,
  @Body() body: {
    recipientId: string;
    recipientModel: 'User' | 'Astrologer';
    title: string;
    message: string;
    imageUrl?: string;
    actionUrl?: string;
    data?: Record<string, any>;
  }
) {
  const notification = await this.notificationService.sendSystemNotification(body);
  
  return {
    success: true,
    message: 'System notification sent',
    data: { notificationId: notification.notificationId },
  };
}

/**
 * POST /admin/notifications/force-logout
 * Force logout a user
 */
@Post('force-logout')
@RequirePermissions(Permissions.USERS_VIEW)
async forceLogoutUser(
  @CurrentAdmin() admin: any,
  @Body() body: {
    recipientId: string;
    recipientModel: 'User' | 'Astrologer';
    reason: string;
  }
) {
  const notification = await this.notificationService.forceLogoutUser({
    ...body,
    adminId: admin._id,
  });
  
  return {
    success: true,
    message: 'User logged out successfully',
    data: { notificationId: notification.notificationId },
  };
}


  /**
   * GET /admin/notifications/scheduled/:scheduleId
   * Get scheduled notification details
   */
  @Get('scheduled/:scheduleId')
  @RequirePermissions(Permissions.NOTIFICATIONS_SEND)
  async getScheduledNotificationById(@Param('scheduleId') scheduleId: string) {
    const notification = await this.notificationSchedulerService.getScheduledNotificationById(scheduleId);
    
    return {
      success: true,
      data: notification,
    };
  }

  /**
   * DELETE /admin/notifications/scheduled/:scheduleId
   * Cancel scheduled notification
   */
  @Delete('scheduled/:scheduleId')
  @RequirePermissions(Permissions.NOTIFICATIONS_BROADCAST)
  async cancelScheduledNotification(
    @Param('scheduleId') scheduleId: string,
    @CurrentAdmin() admin: any,
  ) {
    await this.notificationSchedulerService.cancelScheduledNotification(scheduleId, admin._id);
    
    return {
      success: true,
      message: 'Scheduled notification cancelled',
    };
  }
}
