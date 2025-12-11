// src/auth/services/astrologer-auth.service.ts (COMPLETELY REWRITTEN)
import { Injectable, BadRequestException, UnauthorizedException, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { OtpService } from './otp/otp.service';
import { JwtAuthService } from './jwt-auth/jwt-auth.service';
import { SimpleCacheService } from './cache/cache.service';
import { SendOtpDto } from '../dto/send-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { TruecallerService } from './truecaller.service';
import { TruecallerVerifyDto } from '../dto/truecaller-verify.dto';
import * as crypto from 'crypto';

@Injectable()
export class AstrologerAuthService {
  private readonly logger = new Logger(AstrologerAuthService.name);

  constructor(
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    private otpService: OtpService,
    private jwtAuthService: JwtAuthService,
    private cacheService: SimpleCacheService,
    private truecallerService: TruecallerService,
  ) {}

  private generatePhoneHash(phoneNumber: string): string {
    return crypto.createHash('sha256').update(phoneNumber).digest('hex').substring(0, 16);
  }

  /**
   * ✅ FIXED: Handle device storage for astrologers
   */
  private async handleDeviceStorage(astrologer: AstrologerDocument, deviceInfo: any): Promise<void> {
    if (!deviceInfo?.fcmToken || !deviceInfo?.deviceId) {
      this.logger.warn('⚠️ Missing device info, skipping device storage');
      return;
    }

    this.logger.log('📱 [AstrologerAuth] Processing device storage...', {
      deviceId: deviceInfo.deviceId,
      deviceName: deviceInfo.deviceName,
      deviceType: deviceInfo.deviceType,
    });

    try {
      if (!astrologer.devices) {
        astrologer.devices = [];
      }

      const existingDeviceIndex = astrologer.devices.findIndex(
        (d: any) => 
          d.deviceId === deviceInfo.deviceId || 
          (d.deviceName === deviceInfo.deviceName && d.deviceType === deviceInfo.deviceType)
      );

      if (existingDeviceIndex !== -1) {
        const oldFcmToken = astrologer.devices[existingDeviceIndex].fcmToken;
        
        astrologer.devices[existingDeviceIndex] = {
          ...astrologer.devices[existingDeviceIndex],
          fcmToken: deviceInfo.fcmToken,
          deviceId: deviceInfo.deviceId,
          deviceName: deviceInfo.deviceName || astrologer.devices[existingDeviceIndex].deviceName,
          deviceType: (deviceInfo.deviceType || astrologer.devices[existingDeviceIndex].deviceType) as 'android' | 'ios' | 'web',
          lastActive: new Date(),
          isActive: true,
        };

        this.logger.log('✅ [AstrologerAuth] Device updated', {
          deviceId: deviceInfo.deviceId,
          oldFcmToken: oldFcmToken?.substring(0, 20) + '...',
          newFcmToken: deviceInfo.fcmToken?.substring(0, 20) + '...',
        });
      } else {
        astrologer.devices.push({
          fcmToken: deviceInfo.fcmToken,
          deviceId: deviceInfo.deviceId,
          deviceType: (deviceInfo.deviceType || 'phone') as 'android' | 'ios' | 'web',
          deviceName: deviceInfo.deviceName || 'Unknown Device',
          lastActive: new Date(),
          isActive: true,
        });

        this.logger.log('✅ [AstrologerAuth] New device added', {
          deviceId: deviceInfo.deviceId,
          totalDevices: astrologer.devices.length,
        });
      }

      astrologer.markModified('devices');

      // Single device mode (force logout other devices)
      if (astrologer.devices.length > 1) {
        const oldDevices = astrologer.devices
          .filter(d => d.deviceId !== deviceInfo.deviceId && d.fcmToken)
          .map(d => d.fcmToken);
        
        if (oldDevices.length > 0) {
          this.logger.log('📤 [AstrologerAuth] Sending force logout to old devices:', oldDevices.length);
          this.sendForceLogoutNotification(oldDevices).catch(err => 
            this.logger.error('Failed to send force logout:', err)
          );
        }

        astrologer.devices = astrologer.devices.filter(d => d.deviceId === deviceInfo.deviceId);
        astrologer.markModified('devices');
        
        this.logger.log('✅ [AstrologerAuth] Kept only current device (single device mode)');
      }

      this.logger.log('✅ [AstrologerAuth] Device prepared for saving', {
        astrologerId: (astrologer._id as any).toString(),
        totalDevices: astrologer.devices.length,
      });
    } catch (deviceError) {
      this.logger.error('❌ [AstrologerAuth] Device storage failed:', {
        error: (deviceError as any).message,
      });
    }
  }

  /**
 * ✅ NEW: Get complete astrologer profile
 */
async getCurrentAstrologerProfile(astrologerId: string) {
  try {
    // ✅ await + lean to get plain object
    const astrologer = await this.astrologerModel
      .findById(astrologerId)
      .lean()
      .exec();

    if (!astrologer) {
      throw new NotFoundException('Astrologer profile not found');
    }

    // Optionally strip internal fields
    const { __v, ...safeAstrologer } = astrologer as any;

    return { astrologer: safeAstrologer };
  } catch (error) {
    this.logger.error('Failed to fetch profile', { error: (error as any).message });
    throw error;
  }
}


  /**
   * ✅ FIXED: Check if phone number has approved astrologer account
   */
  async checkPhoneForLogin(phoneNumber: string, countryCode: string) {
    const fullPhoneNumber = `+${countryCode}${phoneNumber}`;
    
    this.logger.log('🔍 Checking for approved astrologer', { fullPhoneNumber });

    // ✅ FIXED: Query astrologer directly by phoneNumber (not via user)
    const astrologer = await this.astrologerModel.findOne({
      phoneNumber: fullPhoneNumber,
      accountStatus: { $in: ['active', 'inactive'] }
    });

    if (!astrologer) {
      this.logger.log('❌ No astrologer found');
      return {
        success: true,
        data: {
          canLogin: false,
          message: 'No approved astrologer account found with this number.'
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

    const checkResult = await this.checkPhoneForLogin(phoneNumber, countryCode);

    if (!checkResult.data.canLogin) {
      throw new BadRequestException(checkResult.data.message);
    }

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
   * ✅ FIXED: Verify OTP and login astrologer (NO USER CREATION)
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

    // ✅ FIXED: Query astrologer directly by phoneNumber (it's a direct field)
    const astrologer = await this.astrologerModel.findOne({ phoneNumber: fullPhoneNumber });

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

    // Handle device storage
    if (fcmToken && deviceId) {
      await this.handleDeviceStorage(astrologer, {
        fcmToken,
        deviceId,
        deviceType,
        deviceName
      });
    } else {
      this.logger.warn('⚠️ Device info missing (fcmToken or deviceId not provided)');
    }

    astrologer.availability.lastActive = new Date();
    
    await astrologer.save();
    this.logger.log('✅ Astrologer document saved with devices');

    // ✅ Generate astrologer-specific tokens
    const tokens = this.jwtAuthService.generateAstrologerTokens(
      astrologer._id as Types.ObjectId,
      astrologer.phoneNumber,
      'astrologer'
    );

    await this.cacheService.set(
      `astrologer_refresh_${(astrologer._id as any).toString()}`,
      tokens.refreshToken,
      7 * 24 * 60 * 60
    );

    this.logger.log('✅ Astrologer login successful with device registered');

    // ✅ FIXED: Return both user and astrologer (consistent with Truecaller)
    return {
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: astrologer._id,
          phoneNumber: astrologer.phoneNumber,
          name: astrologer.name,
          profileImage: astrologer.profilePicture,
          isProfileComplete: astrologer.profileCompletion.isComplete,
        },
        astrologer: {
          id: astrologer._id,
          name: astrologer.name,
          profilePicture: astrologer.profilePicture,
          accountStatus: astrologer.accountStatus,
          isProfileComplete: astrologer.profileCompletion.isComplete,
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
      
      const payload = this.jwtAuthService.verifyRefreshToken(refreshToken);
      
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

      await this.cacheService.del(`astrologer_refresh_${astrologerId}`);

      const astrologer = await this.astrologerModel.findById(astrologerId);
      
      if (astrologer && astrologer.devices && astrologer.devices.length > 0) {
        if (deviceId) {
          const initialCount = astrologer.devices.length;
          astrologer.devices = astrologer.devices.filter(
            (device) => device.deviceId !== deviceId
          );
          
          if (astrologer.devices.length < initialCount) {
            astrologer.markModified('devices');
            this.logger.log(`📱 Removed device ${deviceId} from astrologer`);
          }
        } else {
          this.logger.log('📱 Marking all devices as inactive');
          
          astrologer.devices = astrologer.devices.map(device => ({
            ...device,
            isActive: false,
            lastActive: device.lastActive
          }));
          
          astrologer.markModified('devices');
        }
        
        await astrologer.save();
        this.logger.log('✅ Device changes saved');
      }

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

  /**
   * Send force logout notification via FCM
   */
  private async sendForceLogoutNotification(fcmTokens: string[]): Promise<void> {
    try {
      this.logger.log('📤 [AstrologerAuth] Force logout notification sent to:', {
        count: fcmTokens.length,
        tokens: fcmTokens.map(t => t.substring(0, 20) + '...'),
      });

      // TODO: Replace with your actual FCM service
      /*
      const payload = {
        tokens: fcmTokens,
        notification: {
          title: 'Logged Out',
          body: 'You have been logged out because you signed in from another device.',
        },
        data: {
          type: 'force_logout',
          reason: 'new_device_login',
          userType: 'astrologer',
          timestamp: new Date().toISOString(),
        },
      };

      await this.fcmService.sendMulticast(payload);
      */
    } catch (error) {
      this.logger.error('❌ [AstrologerAuth] Failed to send force logout notification:', error);
    }
  }

  /**
   * ✅ COMPLETELY REWRITTEN: Verify Truecaller for astrologer (NO USER CREATION)
   */
  async verifyTruecaller(truecallerVerifyDto: TruecallerVerifyDto, deviceInfo?: any) {
    try {
      this.logger.log('🔍 [AstrologerAuth] Starting Truecaller verification');

      const verification = await this.truecallerService.verifyOAuthCode(
        truecallerVerifyDto.authorizationCode,
        truecallerVerifyDto.codeVerifier,
        'astro'
      );

      if (!verification.success || !verification.userProfile) {
        throw new BadRequestException(verification.message || 'Truecaller verification failed');
      }

      const { phoneNumber, countryCode, firstName, lastName } = verification.userProfile;
      const phoneHash = this.generatePhoneHash(phoneNumber);
      const fullName = `${firstName || ''} ${lastName || ''}`.trim() || 'Astrologer';

      this.logger.log('✅ [AstrologerAuth] Truecaller provided phone', { phoneNumber, countryCode });

      // ✅ FIXED: Find astrologer directly (NOT user!)
      let astrologer = await this.astrologerModel.findOne({
        phoneNumber: phoneNumber
      });

      let isNewUser = false;

      if (!astrologer) {
        // No astrologer profile — inform frontend to complete registration
        this.logger.log('⚠️ [AstrologerAuth] No astrologer profile found for phone', { phoneNumber });
        return {
          success: true,
          data: {
            canLogin: false,
            message: 'No astrologer profile found. Please complete astrologer registration first.',
            phoneNumber: phoneNumber,
            countryCode: countryCode,
            name: fullName,
            isNewUser: true
          }
        };
      }

      if (astrologer.accountStatus === 'suspended') {
        this.logger.log('⚠️ [AstrologerAuth] Astrologer suspended', { astrologerId: astrologer._id });
        throw new UnauthorizedException(
          `Your account is suspended. Reason: ${astrologer.suspensionReason || 'Please contact support'}`
        );
      }

      // Reactivate if needed
      if (astrologer.accountStatus === 'deleted' || astrologer.accountStatus === 'inactive') {
        astrologer.accountStatus = 'active';
        isNewUser = true; // Treat reactivation as "returning user"
      }

      // Register device if provided
      if (deviceInfo && deviceInfo.fcmToken && deviceInfo.deviceId) {
        await this.handleDeviceStorage(astrologer, deviceInfo);
      } else {
        this.logger.warn('⚠️ [AstrologerAuth] Device info missing (skipping device storage)');
      }

      astrologer.availability.lastActive = new Date();
      await astrologer.save();

      // ✅ Generate astrologer-specific tokens
      const tokens = this.jwtAuthService.generateAstrologerTokens(
        astrologer._id as Types.ObjectId,
        astrologer.phoneNumber,
        'astrologer'
      );

      await this.cacheService.set(
        `astrologer_refresh_${(astrologer._id as any).toString()}`,
        tokens.refreshToken,
        7 * 24 * 60 * 60
      );

      this.logger.log('✅ [AstrologerAuth] Truecaller authentication successful for astrologer', {
        astrologerId: astrologer._id
      });

      // ✅ FIXED: Return consistent structure (user + astrologer)
      return {
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: astrologer._id,
            phoneNumber: astrologer.phoneNumber,
            name: astrologer.name,
            profileImage: astrologer.profilePicture,
            isProfileComplete: astrologer.profileCompletion.isComplete,
          },
          astrologer: {
            id: astrologer._id,
            name: astrologer.name,
            profilePicture: astrologer.profilePicture,
            accountStatus: astrologer.accountStatus,
            isProfileComplete: astrologer.profileCompletion.isComplete,
          },
          tokens,
          isNewUser
        }
      };
    } catch (error) {
      this.logger.error('❌ [AstrologerAuth] Truecaller verification failed', {
        message: (error as any).message,
      });
      throw new BadRequestException((error as any).message || 'Truecaller login failed for astrologer');
    }
  }
}
