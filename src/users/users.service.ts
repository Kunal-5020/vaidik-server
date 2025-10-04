import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // Get user profile by ID
  async getUserProfile(userId: string): Promise<any> {
    const user = await this.userModel.findById(userId).select('-phoneHash').exec();
    
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      data: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        countryCode: user.countryCode,
        name: user.name,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth,
        timeOfBirth: user.timeOfBirth,
        placeOfBirth: user.placeOfBirth,
        currentAddress: user.currentAddress,
        city: user.city,
        state: user.state,
        country: user.country,
        pincode: user.pincode,
        profileImage: user.profileImage,
        appLanguage: user.appLanguage,
        notifications: user.notifications,
        privacy: user.privacy,
        wallet: user.wallet,
        stats: user.stats,
        isPhoneVerified: user.isPhoneVerified,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
        lastActiveAt: user.lastActiveAt
      }
    };
  }

  // Update user profile
  async updateProfile(userId: string, updateData: UpdateProfileDto): Promise<any> {
    const user = await this.userModel.findById(userId);
    
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        user[key] = updateData[key];
      }
    });

    // Convert dateOfBirth string to Date if provided
    if (updateData.dateOfBirth) {
      user.dateOfBirth = new Date(updateData.dateOfBirth);
    }

    await user.save();

    console.log(`✅ Profile updated for user: ${userId}`);

    return {
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: user._id,
        name: user.name,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth,
        timeOfBirth: user.timeOfBirth,
        placeOfBirth: user.placeOfBirth,
        currentAddress: user.currentAddress,
        city: user.city,
        state: user.state,
        country: user.country,
        pincode: user.pincode,
        updatedAt: user.updatedAt
      }
    };
  }

  // Update user preferences
  async updatePreferences(userId: string, preferences: UpdatePreferencesDto): Promise<any> {
    const user = await this.userModel.findById(userId);
    
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update app language
    if (preferences.appLanguage !== undefined) {
      user.appLanguage = preferences.appLanguage;
    }

    // Update notifications
    if (preferences.liveEventsNotification !== undefined) {
      user.notifications.liveEvents = preferences.liveEventsNotification;
    }
    if (preferences.normalNotification !== undefined) {
      user.notifications.normal = preferences.normalNotification;
    }

    // Update privacy settings
    if (preferences.nameVisibleInReviews !== undefined) {
      user.privacy.nameVisibleInReviews = preferences.nameVisibleInReviews;
    }
    if (preferences.astrologerChatAccessAfterEnd !== undefined) {
      user.privacy.restrictions.astrologerChatAccessAfterEnd = preferences.astrologerChatAccessAfterEnd;
    }
    if (preferences.downloadSharedImages !== undefined) {
      user.privacy.restrictions.downloadSharedImages = preferences.downloadSharedImages;
    }
    if (preferences.restrictChatScreenshots !== undefined) {
      user.privacy.restrictions.restrictChatScreenshots = preferences.restrictChatScreenshots;
    }
    if (preferences.accessCallRecording !== undefined) {
      user.privacy.restrictions.accessCallRecording = preferences.accessCallRecording;
    }

    await user.save();

    console.log(`✅ Preferences updated for user: ${userId}`);

    return {
      success: true,
      message: 'Preferences updated successfully',
      data: {
        appLanguage: user.appLanguage,
        notifications: user.notifications,
        privacy: user.privacy,
        updatedAt: user.updatedAt
      }
    };
  }

  // Get user statistics
  async getUserStats(userId: string): Promise<any> {
    const user = await this.userModel.findById(userId).select('stats wallet orders').exec();
    
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      data: {
        wallet: user.wallet,
        stats: user.stats,
        totalOrders: user.orders?.length || 0,
        recentActivity: {
          lastLogin: user.lastLoginAt,
          lastActive: user.lastActiveAt
        }
      }
    };
  }
}
