import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  ValidationPipe
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotificationService } from '../services/notification.service';
import { RegisterDeviceDto } from '../dto/register-device.dto';
import { MarkReadDto } from '../dto/mark-read.dto';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

interface AuthenticatedRequest extends Request {
  user: { _id: string };
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(
    private notificationService: NotificationService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // Register FCM token
  @Post('register-device')
  async registerDevice(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) registerDto: RegisterDeviceDto
  ) {
    // Update user's FCM token
    await this.userModel.findByIdAndUpdate(req.user._id, {
      $set: { fcmToken: registerDto.fcmToken }
    });

    return {
      success: true,
      message: 'Device registered successfully'
    };
  }

  // Get notifications
  @Get()
  async getNotifications(
    @Req() req: AuthenticatedRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('unreadOnly') unreadOnly?: string
  ) {
    return this.notificationService.getUserNotifications(
      req.user._id,
      page,
      limit,
      unreadOnly === 'true'
    );
  }

  // Get unread count
  @Get('unread-count')
  async getUnreadCount(@Req() req: AuthenticatedRequest) {
    const count = await this.notificationService.getUnreadCount(req.user._id);
    return {
      success: true,
      data: { unreadCount: count }
    };
  }

  // Mark as read
  @Patch('mark-read')
  async markAsRead(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) markReadDto: MarkReadDto
  ) {
    await this.notificationService.markAsRead(markReadDto.notificationIds);
    return {
      success: true,
      message: 'Notifications marked as read'
    };
  }

  // Mark all as read
  @Patch('mark-all-read')
  async markAllAsRead(@Req() req: AuthenticatedRequest) {
    await this.notificationService.markAllAsRead(req.user._id);
    return {
      success: true,
      message: 'All notifications marked as read'
    };
  }

  // Delete notification
  @Delete(':notificationId')
  async deleteNotification(
    @Param('notificationId') notificationId: string,
    @Req() req: AuthenticatedRequest
  ) {
    await this.notificationService.deleteNotification(notificationId, req.user._id);
    return {
      success: true,
      message: 'Notification deleted'
    };
  }

  // Clear all notifications
  @Delete()
  async clearAll(@Req() req: AuthenticatedRequest) {
    await this.notificationService.clearAllNotifications(req.user._id);
    return {
      success: true,
      message: 'All notifications cleared'
    };
  }
}
