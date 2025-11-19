// src/notifications/controllers/notification.controller.ts (FIXED)
import {
  Controller,
  Post,
  Delete,
  Patch,
  Get,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { NotificationService } from '../services/notification.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';

interface AuthenticatedRequest extends Request {
  user: { _id: string; userType?: string };
}

interface MarkReadDto {
  notificationIds: string[];
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private notificationService: NotificationService,
  ) {}

  /**
   * Unregister device (logout from device)
   * DELETE /notifications/unregister-device
   */
  @Delete('unregister-device')
  async unregisterDevice(
    @Req() req: AuthenticatedRequest,
    @Body() body: { fcmToken: string }
  ) {
    const userId = req.user._id;
    const userType = req.user.userType || 'user';

    // ✅ Type the model properly
    const model = (
      userType === 'astrologer' ? this.astrologerModel : this.userModel
    ) as Model<UserDocument | AstrologerDocument>;

    // ✅ Use exec() to resolve the query
    const result = await model.findByIdAndUpdate(
      userId,
      {
        $pull: { devices: { fcmToken: body.fcmToken } },
      },
      { new: true }
    ).exec() as any;

    if (!result) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    console.log(`✅ Removed device for user ${userId}`);

    return {
      success: true,
      message: 'Device unregistered successfully',
      data: {
        remainingDevices: result.devices?.length || 0,
      },
    };
  }

  /**
   * Get all registered devices for current user
   * POST /notifications/devices
   */
  @Post('devices')
  async getDevices(@Req() req: AuthenticatedRequest) {
    const userId = req.user._id;
    const userType = req.user.userType || 'user';

    // ✅ Type the model properly
    const model = (
      userType === 'astrologer' ? this.astrologerModel : this.userModel
    ) as Model<UserDocument | AstrologerDocument>;

    // ✅ Use exec() to resolve the query
    const user = await model.findById(userId).select('devices').lean().exec() as any;

    if (!user) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    const devices = (user.devices || []).map((device: any) => ({
      deviceId: device.deviceId,
      deviceType: device.deviceType,
      deviceName: device.deviceName,
      lastActive: device.lastActive,
      isActive: device.isActive,
      fcmToken: device.fcmToken?.substring(0, 20) + '...',
    }));

    return {
      success: true,
      data: {
        devices,
        totalDevices: devices.length,
      },
    };
  }

  /**
   * Mark device as inactive
   * POST /notifications/devices/:deviceId/deactivate
   */
  @Post('devices/:deviceId/deactivate')
  async deactivateDevice(
    @Req() req: AuthenticatedRequest,
    @Param('deviceId') deviceId: string
  ) {
    const userId = req.user._id;
    const userType = req.user.userType || 'user';

    // ✅ Type the model properly
    const model = (
      userType === 'astrologer' ? this.astrologerModel : this.userModel
    ) as Model<UserDocument | AstrologerDocument>;

    // ✅ Use exec() to resolve the query
    const result = await model.findOneAndUpdate(
      { _id: userId, 'devices.deviceId': deviceId },
      {
        $set: { 'devices.$.isActive': false },
      },
      { new: true }
    ).exec() as any;

    if (!result) {
      return {
        success: false,
        message: 'Device not found',
      };
    }

    return {
      success: true,
      message: 'Device deactivated successfully',
    };
  }

  // ============================================
  // NOTIFICATION MANAGEMENT
  // ============================================

  /**
   * Get notifications
   * GET /notifications?page=1&limit=20&unreadOnly=false
   */
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

  /**
   * Get unread count
   * GET /notifications/unread-count
   */
  @Get('unread-count')
  async getUnreadCount(@Req() req: AuthenticatedRequest) {
    const count = await this.notificationService.getUnreadCount(req.user._id);
    return {
      success: true,
      data: { unreadCount: count },
    };
  }

  /**
   * Mark specific notifications as read
   * PATCH /notifications/mark-read
   */
  @Patch('mark-read')
  async markAsRead(
    @Req() req: AuthenticatedRequest,
    @Body(ValidationPipe) markReadDto: MarkReadDto
  ) {
    await this.notificationService.markAsRead(markReadDto.notificationIds);
    return {
      success: true,
      message: 'Notifications marked as read',
    };
  }

  /**
   * Mark all notifications as read
   * PATCH /notifications/mark-all-read
   */
  @Patch('mark-all-read')
  async markAllAsRead(@Req() req: AuthenticatedRequest) {
    await this.notificationService.markAllAsRead(req.user._id);
    return {
      success: true,
      message: 'All notifications marked as read',
    };
  }

  /**
   * Delete specific notification
   * DELETE /notifications/:notificationId
   */
  @Delete(':notificationId')
  async deleteNotification(
    @Param('notificationId') notificationId: string,
    @Req() req: AuthenticatedRequest
  ) {
    await this.notificationService.deleteNotification(notificationId, req.user._id);
    return {
      success: true,
      message: 'Notification deleted',
    };
  }

  /**
   * Clear all notifications
   * DELETE /notifications/clear-all
   */
  @Delete('clear-all')
  async clearAll(@Req() req: AuthenticatedRequest) {
    await this.notificationService.clearAllNotifications(req.user._id);
    return {
      success: true,
      message: 'All notifications cleared',
    };
  }
}
