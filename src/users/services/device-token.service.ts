import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class DeviceTokenService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // Add or update device token
  async addDeviceToken(
    userId: string,
    token: string,
    deviceId?: string
  ): Promise<any> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if token already exists
    if (user.deviceTokens.includes(token)) {
      return {
        success: true,
        message: 'Device token already registered',
      };
    }

    // Add token (limit to 5 tokens per user)
    if (user.deviceTokens.length >= 5) {
      user.deviceTokens.shift(); // Remove oldest
    }

    user.deviceTokens.push(token);
    await user.save();

    return {
      success: true,
      message: 'Device token registered successfully',
    };
  }

  // Remove device token
  async removeDeviceToken(userId: string, token: string): Promise<any> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.deviceTokens = user.deviceTokens.filter(t => t !== token);
    await user.save();

    return {
      success: true,
      message: 'Device token removed successfully',
    };
  }

  // Get all device tokens for user
  async getUserDeviceTokens(userId: string): Promise<string[]> {
    const user = await this.userModel
      .findById(userId)
      .select('deviceTokens')
      .lean();

    if (!user) {
      return [];
    }

    return user.deviceTokens;
  }

  // Check if user should receive notifications
  async shouldSendNotification(
    userId: string,
    notificationType: 'liveEvents' | 'normal'
  ): Promise<boolean> {
    const user = await this.userModel
      .findById(userId)
      .select('notifications status')
      .lean();

    if (!user || user.status !== 'active') {
      return false;
    }

    return user.notifications[notificationType] ?? true;
  }

  // Clean up invalid tokens
  async cleanupInvalidTokens(userId: string, invalidTokens: string[]): Promise<void> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      return;
    }

    user.deviceTokens = user.deviceTokens.filter(
      token => !invalidTokens.includes(token)
    );

    await user.save();
  }
}
