import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { FcmService } from '../../firebase/fcm.service';

@Injectable()
export class DeviceTokenService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private fcmService: FcmService,
  ) {}

  // Register a new device token for user
  async registerDeviceToken(userId: string, token: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate token with FCM
    const isValidToken = await this.fcmService.validateToken(token);
    if (!isValidToken) {
      throw new BadRequestException('Invalid FCM token');
    }

    // Add token if not already present
    if (!user.deviceTokens.includes(token)) {
      user.deviceTokens.push(token);
      await user.save();
      console.log(`✅ Device token registered for user: ${userId}`);
    }
  }

  // Remove device token (on logout or app uninstall)
  async removeDeviceToken(userId: string, token: string): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.deviceTokens = user.deviceTokens.filter(t => t !== token);
    await user.save();
    console.log(`🗑️ Device token removed for user: ${userId}`);
  }

  // Get all device tokens for user
  async getUserDeviceTokens(userId: string): Promise<string[]> {
    const user = await this.userModel.findById(userId).select('deviceTokens');
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.deviceTokens;
  }

  // Update notification settings - ONLY AstroTalk's two options
  async updateNotificationSettings(
    userId: string,
    settings: {
      liveEvents?: boolean;
      normal?: boolean;
    }
  ): Promise<void> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update only liveEvents and normal notifications
    if (settings.liveEvents !== undefined) {
      user.notifications.liveEvents = settings.liveEvents;
    }
    if (settings.normal !== undefined) {
      user.notifications.normal = settings.normal;
    }

    await user.save();
    console.log(`✅ Notification settings updated for user: ${userId}`);
  }

  // Check if user has specific notification enabled
  async shouldSendNotification(userId: string, type: 'liveEvents' | 'normal'): Promise<boolean> {
    const user = await this.userModel.findById(userId).select('notifications');
    if (!user) {
      return false;
    }

    return user.notifications[type];
  }

  // Clean up invalid tokens
  async cleanupInvalidTokens(): Promise<void> {
    const users = await this.userModel.find({ deviceTokens: { $exists: true, $ne: [] } });
    
    for (const user of users) {
      const validTokens: string[] = [];
      
      for (const token of user.deviceTokens) {
        const isValid = await this.fcmService.validateToken(token);
        if (isValid) {
          validTokens.push(token);
        }
      }
      
      if (validTokens.length !== user.deviceTokens.length) {
        user.deviceTokens = validTokens;
        await user.save();
        console.log(`🧹 Cleaned invalid tokens for user: ${user._id}`);
      }
    }
  }
}
