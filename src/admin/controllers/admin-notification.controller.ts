// admin/controllers/admin-notification.controller.ts (NEW)
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { NotificationService } from '../../notifications/services/notification.service';
import { NotificationSchedulerService } from '../services/notification-scheduler.service';
import { NotificationDeliveryService } from '../../notifications/services/notification-delivery.service';
import { SendBroadcastDto, SendBroadcastToUsersDto } from '../dto/send-broadcast.dto';
import { SendNotificationDto } from '../dto/send-notification.dto';
import { ScheduleNotificationDto } from '../dto/schedule-notification.dto';
import { NotifyFollowersDto } from '../dto/notify-followers.dto';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, AdminAuthGuard) // Only admins can access
export class AdminNotificationController {
  constructor(
    private notificationService: NotificationService,
    private schedulerService: NotificationSchedulerService,
    private deliveryService: NotificationDeliveryService,
  ) {}

  // ========== BROADCAST ENDPOINTS ==========

  // ✅ Broadcast to all users
  @Post('broadcast/all-users')
  async broadcastToAllUsers(
    @Body(ValidationPipe) broadcastDto: SendBroadcastDto
  ) {
    const result = await this.notificationService.broadcastToAllUsers(broadcastDto);

    return {
      success: true,
      message: `Broadcast sent to ${result.sent} users`,
      data: result,
    };
  }

  // ✅ Broadcast to specific users
  @Post('broadcast/specific-users')
  async broadcastToSpecificUsers(
    @Body(ValidationPipe) broadcastDto: SendBroadcastToUsersDto
  ) {
    const result = await this.notificationService.broadcastToUsers(
      broadcastDto.userIds,
      {
        type: broadcastDto.type,
        title: broadcastDto.title,
        message: broadcastDto.message,
        data: broadcastDto.data,
        imageUrl: broadcastDto.imageUrl,
        actionUrl: broadcastDto.actionUrl,
        priority: broadcastDto.priority,
      }
    );

    return {
      success: true,
      message: `Notification sent to ${result.sent} users`,
      data: result,
    };
  }

  // ✅ Notify astrologer followers (livestream use case)
  @Post('notify-followers/:astrologerId')
  async notifyFollowers(
    @Param('astrologerId') astrologerId: string,
    @Body(ValidationPipe) notifyDto: NotifyFollowersDto
  ) {
    const result = await this.notificationService.notifyFollowers(astrologerId, notifyDto);

    return {
      success: true,
      message: `Notification sent to ${result.sent} followers`,
      data: result,
    };
  }

  // ========== SCHEDULED NOTIFICATIONS ==========

  // ✅ Schedule notification
 @Post('schedule')
async scheduleNotification(
  @Req() req: AuthenticatedRequest,
  @Body(ValidationPipe) scheduleDto: ScheduleNotificationDto
) {
  const scheduled = await this.schedulerService.scheduleNotification(
    req.user._id,
    {
      ...scheduleDto,
      scheduledFor: new Date(scheduleDto.scheduledFor),
      // ✅ Type is now properly inferred from DTO
    }
  );

  return {
    success: true,
    message: 'Notification scheduled successfully',
    data: scheduled,
  };
}

  // ✅ Get all scheduled notifications
  @Get('scheduled')
  async getScheduledNotifications(
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.schedulerService.getScheduledNotifications(status, page, limit);
  }

  // ✅ Get upcoming scheduled notifications (next 24 hours)
  @Get('scheduled/upcoming')
  async getUpcomingNotifications() {
    const upcoming = await this.schedulerService.getUpcomingNotifications();

    return {
      success: true,
      data: upcoming,
    };
  }

  // ✅ Get scheduled notification by ID
  @Get('scheduled/:scheduleId')
  async getScheduledNotificationById(@Param('scheduleId') scheduleId: string) {
    const scheduled = await this.schedulerService.getScheduledNotificationById(scheduleId);

    return {
      success: true,
      data: scheduled,
    };
  }

  // ✅ Cancel scheduled notification
  @Delete('scheduled/:scheduleId')
  async cancelScheduledNotification(
    @Req() req: AuthenticatedRequest,
    @Param('scheduleId') scheduleId: string
  ) {
    await this.schedulerService.cancelScheduledNotification(scheduleId, req.user._id);

    return {
      success: true,
      message: 'Scheduled notification cancelled',
    };
  }

  // ========== STATS & MONITORING ==========

  // ✅ Get notification stats
  @Get('stats')
  async getNotificationStats() {
    const stats = await this.notificationService.getNotificationStats();

    return {
      success: true,
      data: stats,
    };
  }

  // ✅ Get connected users/admins count
  @Get('stats/connections')
  async getConnectionStats() {
    return {
      success: true,
      data: {
        connectedUsers: this.deliveryService.getConnectedUsersCount(),
        connectedAdmins: this.deliveryService.getConnectedAdminsCount(),
      },
    };
  }

  // ✅ Check if user is online
  @Get('check-online/:userId')
  async checkUserOnline(@Param('userId') userId: string) {
    const isOnline = this.deliveryService.isUserOnline(userId);

    return {
      success: true,
      data: {
        userId,
        isOnline,
      },
    };
  }

  // ========== TESTING ==========

  // ✅ Test admin notification (Socket.io)
  @Post('test')
  async testAdminNotification(@Req() req: AuthenticatedRequest) {
    this.deliveryService.sendRealtimeEventToAdmins('test_notification', {
      message: 'This is a test notification',
      sentBy: req.user._id,
      timestamp: new Date(),
    });

    return {
      success: true,
      message: 'Test notification sent to all connected admins',
    };
  }

  // ✅ Broadcast system alert
  @Post('system-alert')
  async broadcastSystemAlert(
    @Body() body: { message: string; data?: any }
  ) {
    this.deliveryService.broadcastSystemAlert(body.message, body.data);

    return {
      success: true,
      message: 'System alert broadcasted to all admins',
    };
  }

  @Post('send/fullscreen')
async sendFullScreenNotification(
  @Body(ValidationPipe) body: SendNotificationDto, // Define a DTO with required fields
) {
  const notification = await this.notificationService.sendNotification({
    recipientId: body.recipientId,
    recipientModel: body.recipientModel,
    type: body.type || 'call_incoming',
    title: body.title,
    message: body.message,
    data: {
      ...(body.data || {}),
      fullScreen: true, // Client checks this to show full-screen UI
    },
    imageUrl: body.imageUrl,
    actionUrl: body.actionUrl,
    priority: 'urgent', // urgent for full screen intent on Android
  });

  return {
    success: true,
    message: 'Full-screen notification sent',
    data: notification,
  };
}
}
