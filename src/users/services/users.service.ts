import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { UpdatePreferencesDto } from '../dto/update-preferences.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // ===== PROFILE MANAGEMENT =====

  // Get user profile
  async getUserProfile(userId: string): Promise<any> {
    const user = await this.userModel
      .findById(userId)
      .select('-phoneHash -deviceTokens')
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      data: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        countryCode: user.countryCode,
        isPhoneVerified: user.isPhoneVerified,
        registrationMethod: user.registrationMethod,
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
        profileImageStorageType: user.profileImageStorageType,
        isProfileComplete: user.isProfileComplete,
        appLanguage: user.appLanguage,
        notifications: user.notifications,
        privacy: user.privacy,
        wallet: user.wallet,
        stats: user.stats,
        status: user.status,
        lastLoginAt: user.lastLoginAt,
        lastActiveAt: user.lastActiveAt,
        createdAt: user.createdAt,
      },
    };
  }

  // Update user profile
  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto): Promise<any> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Build update object
    const updateFields: any = {};

    if (updateProfileDto.name !== undefined) updateFields.name = updateProfileDto.name;
    if (updateProfileDto.gender !== undefined) updateFields.gender = updateProfileDto.gender;
    if (updateProfileDto.dateOfBirth !== undefined) updateFields.dateOfBirth = updateProfileDto.dateOfBirth;
    if (updateProfileDto.timeOfBirth !== undefined) updateFields.timeOfBirth = updateProfileDto.timeOfBirth;
    if (updateProfileDto.placeOfBirth !== undefined) updateFields.placeOfBirth = updateProfileDto.placeOfBirth;
    if (updateProfileDto.currentAddress !== undefined) updateFields.currentAddress = updateProfileDto.currentAddress;
    if (updateProfileDto.city !== undefined) updateFields.city = updateProfileDto.city;
    if (updateProfileDto.state !== undefined) updateFields.state = updateProfileDto.state;
    if (updateProfileDto.country !== undefined) updateFields.country = updateProfileDto.country;
    if (updateProfileDto.pincode !== undefined) updateFields.pincode = updateProfileDto.pincode;
    if (updateProfileDto.profileImage !== undefined) {
      updateFields.profileImage = updateProfileDto.profileImage;
      updateFields.profileImageStorageType = updateProfileDto.profileImageStorageType || 's3';
      if (updateProfileDto.profileImageS3Key) {
        updateFields.profileImageS3Key = updateProfileDto.profileImageS3Key;
      }
    }

    // Check if profile is complete
    const isProfileComplete = !!(
      updateFields.name || user.name
    ) && !!(
      updateFields.gender || user.gender
    ) && !!(
      updateFields.dateOfBirth || user.dateOfBirth
    );

    updateFields.isProfileComplete = isProfileComplete;
    updateFields.updatedAt = new Date();

    const updatedUser = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: updateFields },
      { new: true }
    ).select('-phoneHash -deviceTokens');

    return {
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser,
    };
  }

  // ===== PREFERENCES MANAGEMENT =====

  // Get user preferences
  async getPreferences(userId: string): Promise<any> {
    const user = await this.userModel
      .findById(userId)
      .select('appLanguage notifications privacy')
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      data: {
        appLanguage: user.appLanguage,
        notifications: user.notifications,
        privacy: user.privacy,
      },
    };
  }

  // Update user preferences
async updatePreferences(userId: string, updateDto: UpdatePreferencesDto): Promise<any> {
  const user = await this.userModel.findById(userId);

  if (!user) {
    throw new NotFoundException('User not found');
  }

  const updateFields: any = {};

  if (updateDto.appLanguage !== undefined) {
    updateFields.appLanguage = updateDto.appLanguage;
  }

  if (updateDto.liveEventsNotification !== undefined) {
    updateFields['notifications.liveEvents'] = updateDto.liveEventsNotification;
  }

  if (updateDto.normalNotification !== undefined) {
    updateFields['notifications.normal'] = updateDto.normalNotification;
  }

  if (updateDto.nameVisibleInReviews !== undefined) {
    updateFields['privacy.nameVisibleInReviews'] = updateDto.nameVisibleInReviews;
  }

  if (updateDto.astrologerChatAccessAfterEnd !== undefined) {
    updateFields['privacy.restrictions.astrologerChatAccessAfterEnd'] = updateDto.astrologerChatAccessAfterEnd;
  }

  if (updateDto.downloadSharedImages !== undefined) {
    updateFields['privacy.restrictions.downloadSharedImages'] = updateDto.downloadSharedImages;
  }

  if (updateDto.restrictChatScreenshots !== undefined) {
    updateFields['privacy.restrictions.restrictChatScreenshots'] = updateDto.restrictChatScreenshots;
  }

  if (updateDto.accessCallRecording !== undefined) {
    updateFields['privacy.restrictions.accessCallRecording'] = updateDto.accessCallRecording;
  }

  const updatedUser = await this.userModel.findByIdAndUpdate(
    userId,
    { $set: { ...updateFields, updatedAt: new Date() } },
    { new: true }
  ).select('appLanguage notifications privacy');

  // ✅ FIX: Add null check BEFORE accessing properties
  if (!updatedUser) {
    throw new NotFoundException('User not found after update');
  }

  // ✅ NOW it's safe to access properties
  return {
    success: true,
    message: 'Preferences updated successfully',
    data: {
      appLanguage: updatedUser.appLanguage,
      notifications: updatedUser.notifications,
      privacy: updatedUser.privacy,
    },
  };
}


  // ===== WALLET MANAGEMENT =====

  // Get wallet details
  async getWallet(userId: string): Promise<any> {
    const user = await this.userModel
      .findById(userId)
      .select('wallet')
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const wallet = user.wallet as any;
    const currentBalance = wallet?.balance || 0;

    return {
      success: true,
      data: {
        ...wallet,
        balance: currentBalance,
        cashBalance: wallet?.cashBalance ?? currentBalance,
        bonusBalance: wallet?.bonusBalance ?? 0,
      },
    };
  }

  // ===== FAVORITES MANAGEMENT =====

  // Get favorite astrologers
  async getFavoriteAstrologers(userId: string): Promise<any> {
    const user = await this.userModel
      .findById(userId)
      .select('favoriteAstrologers')
      .populate('favoriteAstrologers', 'name profilePicture experienceYears specializations ratings pricing')
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      data: user.favoriteAstrologers,
    };
  }

  // Add to favorites
  async addFavorite(userId: string, astrologerId: string): Promise<any> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if already in favorites
    if (user.favoriteAstrologers.some(id => id.toString() === astrologerId)) {
      throw new BadRequestException('Astrologer already in favorites');
    }

    user.favoriteAstrologers.push(astrologerId as any);
    await user.save();

    return {
      success: true,
      message: 'Astrologer added to favorites',
    };
  }

  // Remove from favorites
  async removeFavorite(userId: string, astrologerId: string): Promise<any> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.favoriteAstrologers = user.favoriteAstrologers.filter(
      id => id.toString() !== astrologerId
    );

    await user.save();

    return {
      success: true,
      message: 'Astrologer removed from favorites',
    };
  }

  // ===== STATISTICS =====

  // Get user statistics
  async getUserStatistics(userId: string): Promise<any> {
    const user = await this.userModel
      .findById(userId)
      .select('wallet stats')
      .lean();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      data: {
        wallet: user.wallet,
        stats: user.stats,
      },
    };
  }

  // Update user stats (internal use only)
  async updateStats(
    userId: string,
    updates: {
      incrementSessions?: number;
      addMinutes?: number;
      addAmount?: number;
      incrementRatings?: number;
    }
  ): Promise<void> {
    const updateFields: any = {};

    if (updates.incrementSessions) {
      updateFields.$inc = { ...updateFields.$inc, 'stats.totalSessions': updates.incrementSessions };
    }
    if (updates.addMinutes) {
      updateFields.$inc = { ...updateFields.$inc, 'stats.totalMinutesSpent': updates.addMinutes };
    }
    if (updates.addAmount) {
      updateFields.$inc = { ...updateFields.$inc, 'stats.totalAmount': updates.addAmount };
    }
    if (updates.incrementRatings) {
      updateFields.$inc = { ...updateFields.$inc, 'stats.totalRatings': updates.incrementRatings };
    }

    if (Object.keys(updateFields).length > 0) {
      await this.userModel.findByIdAndUpdate(userId, updateFields);
    }
  }

  // ===== ACCOUNT MANAGEMENT =====

  // Delete user account (soft delete)
  async deleteAccount(userId: string): Promise<any> {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userModel.findByIdAndUpdate(userId, {
      status: 'deleted',
      updatedAt: new Date()
    });

    return {
      success: true,
      message: 'Account deleted successfully',
    };
  }

  // Update last active timestamp
  async updateLastActive(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, {
      lastActiveAt: new Date(),
    });
  }

  // ===== INTERNAL METHODS =====

  // Get user by phone number
  async getUserByPhone(phoneNumber: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ phoneNumber }).exec();
  }

  // Create new user
  async createUser(userData: {
    phoneNumber: string;
    countryCode: string;
    phoneHash: string;
    registrationMethod: 'truecaller' | 'otp';
  }): Promise<UserDocument> {
    const user = new this.userModel({
      ...userData,
      isPhoneVerified: true,
      appLanguage: 'en',
      notifications: {
        liveEvents: true,
        normal: true,
      },
      privacy: {
        nameVisibleInReviews: false,
        restrictions: {
          astrologerChatAccessAfterEnd: true,
          downloadSharedImages: true,
          restrictChatScreenshots: true,
          accessCallRecording: true,
        },
      },
      wallet: {
        balance: 0,
        totalRecharged: 0,
        totalSpent: 0,
      },
      stats: {
        totalSessions: 0,
        totalMinutesSpent: 0,
        totalAmount: 0,
        totalRatings: 0,
      },
      favoriteAstrologers: [],
      status: 'active',
    });

    return user.save();
  }
}
