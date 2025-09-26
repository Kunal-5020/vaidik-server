import { Controller, Post, Delete, Put, Body, Req, UseGuards, HttpCode, HttpStatus, Get } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { DeviceTokenService } from '../services/device-token.service';
import { UserDocument } from '../schemas/user.schema';

interface AuthenticatedRequest {
  user: UserDocument;
}

@Controller('device-tokens')
@UseGuards(JwtAuthGuard)
export class DeviceTokenController {
  constructor(private readonly deviceTokenService: DeviceTokenService) {}

  // Register FCM device token
  @Post('register')
  @HttpCode(HttpStatus.OK)
  async registerToken(
    @Req() req: AuthenticatedRequest,
    @Body() body: { token: string }
  ) {
    const userId = (req.user._id as any).toString();
    await this.deviceTokenService.registerDeviceToken(userId, body.token);
    
    return {
      success: true,
      message: 'Device token registered successfully'
    };
  }

  // Remove FCM device token
  @Delete('remove')
  @HttpCode(HttpStatus.OK)
  async removeToken(
    @Req() req: AuthenticatedRequest,
    @Body() body: { token: string }
  ) {
    const userId = (req.user._id as any).toString();
    await this.deviceTokenService.removeDeviceToken(userId, body.token);
    
    return {
      success: true,
      message: 'Device token removed successfully'
    };
  }

  // Update notification settings - ONLY AstroTalk's two options
  @Put('notification-settings')
  @HttpCode(HttpStatus.OK)
  async updateNotificationSettings(
    @Req() req: AuthenticatedRequest,
    @Body() settings: {
      liveEvents?: boolean;
      normal?: boolean;
    }
  ) {
    const userId = (req.user._id as any).toString();
    await this.deviceTokenService.updateNotificationSettings(userId, settings);
    
    return {
      success: true,
      message: 'Notification settings updated successfully',
      data: {
        liveEvents: settings.liveEvents,
        normal: settings.normal
      }
    };
  }

  // Get current notification settings
  @Get('notification-settings')
  async getNotificationSettings(@Req() req: AuthenticatedRequest) {
    const user = req.user;
    
    return {
      success: true,
      data: {
        liveEvents: user.notifications.liveEvents,
        normal: user.notifications.normal
      }
    };
  }
}
