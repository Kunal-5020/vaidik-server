import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { OtpService } from './otp/otp.service';
import { JwtAuthService } from './jwt-auth/jwt-auth.service';
import { SimpleCacheService } from './cache/cache.service';
import { SendOtpDto } from '../dto/send-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';

@Injectable()
export class AstrologerAuthService {
  private readonly logger = new Logger(AstrologerAuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private otpService: OtpService,
    private jwtAuthService: JwtAuthService,
    private cacheService: SimpleCacheService,
  ) {}

  /**
   * Check if phone number has approved astrologer account
   */
  async checkPhoneForLogin(phoneNumber: string, countryCode: string) {
    const fullPhoneNumber = `+${countryCode}${phoneNumber}`;
    
    this.logger.log('🔍 Checking for approved astrologer', { fullPhoneNumber });

    // Find user by phone number
    const user = await this.userModel.findOne({
      phoneNumber: fullPhoneNumber,
      isPhoneVerified: true
    });

    if (!user) {
      this.logger.log('❌ No user found');
      return {
        success: true,
        data: {
          canLogin: false,
          message: 'No approved astrologer account found with this number.'
        }
      };
    }

    // Find astrologer profile linked to this user
    const astrologer = await this.astrologerModel.findOne({
      userId: user._id,
      accountStatus: { $in: ['active', 'inactive'] } // Not suspended
    });

    if (!astrologer) {
      this.logger.log('❌ No astrologer profile found for this user');
      return {
        success: true,
        data: {
          canLogin: false,
          message: 'No approved astrologer account found. Please complete registration first.'
        }
      };
    }

    if (astrologer.accountStatus === 'suspended') {
      this.logger.log('⚠️ Astrologer account suspended');
      return {
        success: true,
        data: {
          canLogin: false,
          message: 'Your account is suspended. Please contact support.'
        }
      };
    }

    this.logger.log('✅ Approved astrologer found', {
      userId: user._id,
      astrologerId: astrologer._id
    });

    return {
      success: true,
      data: {
        canLogin: true,
        message: 'Account found. You can proceed to login.',
        astrologerName: astrologer.name,
        profileComplete: astrologer.profileCompletion.isComplete
      }
    };
  }

  /**
   * Send OTP for astrologer login
   */
  async sendLoginOtp(sendOtpDto: SendOtpDto) {
    const { phoneNumber, countryCode } = sendOtpDto;

    // Check if astrologer can login
    const checkResult = await this.checkPhoneForLogin(phoneNumber, countryCode);

    if (!checkResult.data.canLogin) {
      throw new BadRequestException(checkResult.data.message);
    }

    // Send OTP
    const result = await this.otpService.sendOTP(phoneNumber, countryCode);

    return {
      success: true,
      message: 'OTP sent successfully',
      data: {
        phoneNumber,
        countryCode: `+${countryCode}`,
        expiryTime: 600,
        ...(process.env.NODE_ENV === 'development' && result.otp && { otp: result.otp })
      }
    };
  }

  /**
 * Verify OTP and login astrologer
 */
async verifyLoginOtp(verifyOtpDto: VerifyOtpDto) {
  const { phoneNumber, countryCode, otp, fcmToken, deviceId, deviceType, deviceName } = verifyOtpDto;

  this.logger.log('🔍 [AstrologerAuth] Verifying OTP with device info:', {
    phoneNumber,
    otp: '****',
    fcmToken: fcmToken ? `${fcmToken.substring(0, 15)}...` : 'N/A',
    deviceId,
    deviceType,
    deviceName
  });

  const isOtpValid = await this.otpService.verifyOTP(phoneNumber, countryCode, otp);

  if (!isOtpValid) {
    this.logger.error('❌ Invalid OTP');
    throw new BadRequestException('Invalid or expired OTP');
  }

  this.logger.log('✅ OTP is valid');

  const fullPhoneNumber = `+${countryCode}${phoneNumber}`;
  
  const user = await this.userModel.findOne({ phoneNumber: fullPhoneNumber });

  if (!user) {
    throw new UnauthorizedException('User not found');
  }

  this.logger.log('✅ User found', { userId: user._id });

  const astrologer = await this.astrologerModel.findOne({ userId: user._id });

  if (!astrologer) {
    throw new UnauthorizedException('Astrologer profile not found');
  }

  if (astrologer.accountStatus === 'suspended') {
    throw new UnauthorizedException(
      `Your account is suspended. Reason: ${astrologer.suspensionReason || 'Please contact support'}`
    );
  }

  this.logger.log('✅ Astrologer found', { astrologerId: astrologer._id });

  // Reactivate if needed
  if (astrologer.accountStatus === 'deleted' || astrologer.accountStatus === 'inactive') {
    this.logger.log(`♻️ Reactivating ${astrologer.accountStatus} astrologer`);
    astrologer.accountStatus = 'active';
  }

  if (user.status === 'deleted' || user.status === 'inactive') {
    this.logger.log(`♻️ Reactivating ${user.status} user`);
    user.status = 'active';
  }

  // ✅ SAVE DEVICE TOKEN (FIXED VERSION)
  if (fcmToken && deviceId) {
    this.logger.log('📱 [AstrologerAuth] Processing device token...', {
      deviceId,
      deviceType: deviceType || 'phone',
      deviceName: deviceName || 'Unknown Device'
    });

    try {
      // Initialize devices array if it doesn't exist
      if (!astrologer.devices) {
        astrologer.devices = [];
      }

      // Check if device already exists (by deviceId)
      const existingDeviceIndex = astrologer.devices.findIndex(
        (d) => d.deviceId === deviceId
      );

      if (existingDeviceIndex !== -1) {
        // ✅ Update existing device using .set() method
        this.logger.log(`🔄 Updating existing device at index ${existingDeviceIndex}`);
        
       astrologer.devices[existingDeviceIndex] = {
  fcmToken,
  deviceId,
  deviceType: (deviceType || 'phone') as 'android' | 'ios' | 'web',
  deviceName: deviceName || 'Unknown Device',
  lastActive: new Date(),
  isActive: true,
};
      } else {
        // ✅ Add new device using .push()
        this.logger.log(`➕ Adding new device: ${deviceId}`);
        
        astrologer.devices.push({
          fcmToken,
          deviceId,
          deviceType: (deviceType || 'phone') as 'android' | 'ios' | 'web',
          deviceName: deviceName || 'Unknown Device',
          lastActive: new Date(),
          isActive: true,
        });
      }

      // ✅ CRITICAL: Mark the array as modified
      astrologer.markModified('devices');

      // Keep only last 5 devices
      if (astrologer.devices.length > 5) {
        this.logger.log('🧹 Trimming to 5 most recent devices');
        astrologer.devices = astrologer.devices
          .sort((a, b) => 
            new Date(b.lastActive).getTime() - new Date(a.lastActive).getTime()
          )
          .slice(0, 5);
        
        // ✅ Mark modified again after sorting/slicing
        astrologer.markModified('devices');
      }

      this.logger.log(`✅ Device token prepared for saving:`, {
        fcmToken: `${fcmToken.substring(0, 20)}...`,
        totalDevices: astrologer.devices.length,
        deviceIds: astrologer.devices.map(d => d.deviceId)
      });
    } catch (deviceError) {
      this.logger.error('❌ Device processing failed:', {
        error: (deviceError as any).message,
        stack: (deviceError as any).stack?.substring(0, 200)
      });
      // Don't fail login if device storage fails
    }
  } else {
    this.logger.warn('⚠️ Device info missing (fcmToken or deviceId not provided)');
  }

  astrologer.availability.lastActive = new Date();
  
  // ✅ Save astrologer document (this will now save devices array)
  await astrologer.save();
  this.logger.log('✅ Astrologer document saved with devices');

  user.lastLoginAt = new Date();
  await user.save();

  const tokens = this.jwtAuthService.generateAstrologerTokens(
    user._id as Types.ObjectId,
    astrologer._id as Types.ObjectId,
    user.phoneNumber,
    'astrologer'
  );

  await this.cacheService.set(
    `astrologer_refresh_${(user._id as any).toString()}`,
    tokens.refreshToken,
    7 * 24 * 60 * 60
  );

  this.logger.log('✅ Astrologer login successful with device registered');

  return {
    success: true,
    message: 'Login successful',
    data: {
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        name: user.name || astrologer.name,
        profileImage: user.profileImage
      },
      astrologer: {
        id: astrologer._id,
        name: astrologer.name,
        profilePicture: astrologer.profilePicture,
        accountStatus: astrologer.accountStatus,
      },
      tokens,
    },
  };
}



  /**
   * Refresh astrologer token
   */
  async refreshToken(refreshToken: string) {
    try {
      this.logger.log('🔄 Refreshing astrologer token');

      const newTokens = this.jwtAuthService.refreshAstrologerToken(refreshToken);
      
      // Extract payload to get userId
      const payload = this.jwtAuthService.verifyRefreshToken(refreshToken);
      
      // Update cache with new refresh token
      await this.cacheService.set(
        `astrologer_refresh_${payload.userId}`,
        newTokens.refreshToken,
        7 * 24 * 60 * 60
      );

      this.logger.log('✅ Token refreshed successfully');

      return {
        success: true,
        message: 'Token refreshed successfully',
        data: newTokens
      };
    } catch (error) {
      this.logger.error('❌ Token refresh failed', { error: error.message });
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

 /**
 * Logout astrologer and remove device token
 */
async logout(userId: string, astrologerId: string, deviceId?: string) {
  try {
    this.logger.log('🚪 Logging out astrologer', { userId, astrologerId, deviceId });

    // Remove refresh token from cache
    await this.cacheService.del(`astrologer_refresh_${userId}`);

    const astrologer = await this.astrologerModel.findById(astrologerId);
    
    if (astrologer && astrologer.devices && astrologer.devices.length > 0) {
      if (deviceId) {
        // ✅ Remove specific device
        const initialCount = astrologer.devices.length;
        astrologer.devices = astrologer.devices.filter(
          (device) => device.deviceId !== deviceId
        );
        
        if (astrologer.devices.length < initialCount) {
          // ✅ Mark as modified after reassignment
          astrologer.markModified('devices');
          this.logger.log(`📱 Removed device ${deviceId} from astrologer`);
        }
      } else {
        // ✅ Mark all devices as inactive (FIXED VERSION)
        this.logger.log('📱 Marking all devices as inactive');
        
        // Option 1: Reassign entire array with updated values
        astrologer.devices = astrologer.devices.map(device => ({
          ...device,
          isActive: false,
          lastActive: device.lastActive
        }));
        
        astrologer.markModified('devices');
      }
      
      // Save astrologer document with device changes
      await astrologer.save();
      this.logger.log('✅ Device changes saved');
    }

    // Update astrologer availability to offline
    await this.astrologerModel.findByIdAndUpdate(
      astrologerId,
      {
        'availability.isOnline': false,
        'availability.isAvailable': false,
        'availability.isLive': false,
        'availability.lastActive': new Date()
      }
    );

    this.logger.log('✅ Logout successful');

    return {
      success: true,
      message: 'Logged out successfully'
    };
  } catch (error) {
    this.logger.error('❌ Logout failed', { error: error.message });
    throw new BadRequestException('Logout failed');
  }
}

}
