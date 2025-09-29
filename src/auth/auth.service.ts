// src/auth/auth.service.ts
import { 
  Injectable, 
  BadRequestException, 
  UnauthorizedException, 
  Logger 
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto'; // Fixed import
import { User, UserDocument } from '../users/schemas/user.schema';
import { OtpService } from './services/otp/otp.service';
import { TruecallerService } from './services/truecaller.service';
import { JwtAuthService, TokenPair } from './services/jwt-auth/jwt-auth.service';
import { SimpleCacheService } from './services/cache/cache.service';
import { TruecallerVerifyDto } from './dto/truecaller-verify.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private otpService: OtpService,
    private jwtAuthService: JwtAuthService,
    private truecallerService: TruecallerService,
    private configService: ConfigService,
    private cacheService: SimpleCacheService,
  ) {}

  async sendOtp(phoneNumber: string, countryCode: string) {
    try {
      const result = await this.otpService.sendOTP(phoneNumber, countryCode);
      
      return {
        success: true,
        message: result.message,
        data: {
          phoneNumber,
          countryCode,
          expiryTime: 600, // 10 minutes in seconds
          // Only include OTP in development
          ...(process.env.NODE_ENV === 'development' && result.otp && { otp: result.otp })
        }
      };
    } catch (error) {
      throw error;
    }
  }

  async resendOtp(phoneNumber: string, countryCode: string) {
    try {
      const result = await this.otpService.resendOTP(phoneNumber, countryCode);
      
      return {
        success: true,
        message: result.message,
        data: {
          phoneNumber,
          countryCode,
          expiryTime: 600, // 10 minutes in seconds
          // Only include OTP in development
          ...(process.env.NODE_ENV === 'development' && result.otp && { otp: result.otp })
        }
      };
    } catch (error) {
      throw error;
    }
  }

  async verifyOtp(phoneNumber: string, countryCode: string, otp: string): Promise<{
    success: boolean;
    message: string;
    data: {
      user: any;
      tokens: TokenPair;
      isNewUser: boolean;
    }
  }> {
    try {
      // Verify OTP
      const isOtpValid = await this.otpService.verifyOTP(phoneNumber, countryCode, otp);
      
      if (!isOtpValid) {
        throw new BadRequestException('Invalid OTP');
      }

      // Hash phone number with country code
      const phoneHash = this.otpService.hashPhoneNumber(phoneNumber, countryCode);
      const fullPhoneNumber = `+${countryCode}${phoneNumber}`;

      // Find or create user
      let user = await this.userModel.findOne({ 
        $or: [
          { phoneNumber: phoneNumber }, // Legacy compatibility
          { phoneNumber: fullPhoneNumber } // New format with country code
        ]
      }).exec();
      
      let isNewUser = false;

      if (!user) {
        // Create new user
        user = new this.userModel({
          phoneNumber: fullPhoneNumber, // Store with country code
          phoneHash,
          countryCode,
          isPhoneVerified: true,
          status: 'active',
          appLanguage: 'en',
          registrationMethod: 'otp',
          notifications: {
            liveEvents: true,
            normal: true
          },
          privacy: {
            nameVisibleInReviews: true,
            restrictions: {
              astrologerChatAccessAfterEnd: true,
              downloadSharedImages: true,
              restrictChatScreenshots: true,
              accessCallRecording: true
            }
          },
          wallet: {
            balance: 0,
            totalRecharged: 0,
            totalSpent: 0,
            currency: 'INR'
          },
          stats: {
            totalSessions: 0,
            totalMinutesSpent: 0,
            totalAmount: 0,
            totalRatings: 0
          },
          orders: [],
          walletTransactions: [],
          remedies: [],
          reports: [],
          favoriteAstrologers: []
        });

        await user.save();
        isNewUser = true;
      } else {
        // Update existing user
        user.isPhoneVerified = true;
        user.lastLoginAt = new Date();
        user.countryCode = countryCode; // Update country code if changed
        user.phoneHash = phoneHash; // Update phone hash
        await user.save();
      }

      // Generate JWT tokens
      const tokens = this.jwtAuthService.generateTokenPair(
        user._id as Types.ObjectId,
        user.phoneNumber,
        user.phoneHash
      );

      // Store refresh token in cache (for logout functionality)
      await this.cacheService.set(
        `refresh_token_${user._id}`, 
        tokens.refreshToken, 
        7 * 24 * 60 * 60 // 7 days in seconds
      );

      return {
        success: true,
        message: isNewUser ? 'Registration successful' : 'Login successful',
        data: {
          user: {
            id: user._id,
            phoneNumber: user.phoneNumber,
            countryCode: user.countryCode,
            name: user.name,
            profileImage: user.profileImage,
            wallet: user.wallet,
            stats: user.stats,
            isPhoneVerified: user.isPhoneVerified,
            appLanguage: user.appLanguage,
            createdAt: user.createdAt
          },
          tokens,
          isNewUser
        }
      };

    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('OTP verification failed');
    }
  }

  // Fixed - Single refreshToken method
  async refreshToken(refreshToken: string) {
    try {
      const newTokens = this.jwtAuthService.refreshAccessToken(refreshToken);
      
      return {
        success: true,
        message: 'Token refreshed successfully',
        data: newTokens
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    try {
      // Remove refresh token from cache
      await this.cacheService.del(`refresh_token_${userId}`);

      return {
        success: true,
        message: 'Logged out successfully'
      };
    } catch (error) {
      throw new BadRequestException('Logout failed');
    }
  }

  // Fixed TrueCaller verification
  async verifyTruecaller(truecallerVerifyDto: TruecallerVerifyDto) {
    try {
      // Verify phone number with TrueCaller
      const verification = await this.truecallerService.verifyPhoneNumber(
        truecallerVerifyDto.phoneNumber,
        truecallerVerifyDto.signature,
        truecallerVerifyDto.payload,
        truecallerVerifyDto.signatureAlgorithm
      );

      if (!verification.success || !verification.phoneNumber) {
        throw new BadRequestException(verification.message || 'TrueCaller verification failed');
      }

      // Extract country code and phone number
      const { phoneNumber, countryCode } = this.parsePhoneNumber(verification.phoneNumber);
      const phoneHash = this.generatePhoneHash(verification.phoneNumber);

      // Check if user exists
      let user = await this.userModel.findOne({ phoneNumber: verification.phoneNumber });
      let isNewUser = false;

      if (!user) {
        // Create new user with TrueCaller data
        user = new this.userModel({
          phoneNumber: verification.phoneNumber,
          phoneHash,
          countryCode,
          isPhoneVerified: true,
          registrationMethod: 'truecaller',
          status: 'active',
          appLanguage: 'en',
          notifications: {
            liveEvents: true,
            normal: true
          },
          privacy: {
            nameVisibleInReviews: true,
            restrictions: {
              astrologerChatAccessAfterEnd: true,
              downloadSharedImages: true,
              restrictChatScreenshots: true,
              accessCallRecording: true
            }
          },
          wallet: {
            balance: 0,
            currency: 'INR',
            totalSpent: 0,
            totalRecharged: 0
          },
          stats: {
            totalSessions: 0,
            totalMinutesSpent: 0,
            totalAmount: 0,
            totalRatings: 0
          },
          orders: [],
          walletTransactions: [],
          remedies: [],
          reports: [],
          favoriteAstrologers: [],
          createdAt: new Date()
        });
        await user.save();
        isNewUser = true;
      } else {
        user.isPhoneVerified = true;
        user.lastLoginAt = new Date();
        user.phoneHash = phoneHash; // Update phone hash
        await user.save();
      }

      // Generate tokens
      const tokens = this.jwtAuthService.generateTokenPair(
        user._id as Types.ObjectId,
        user.phoneNumber,
        phoneHash
      );

      // Store refresh token
      await this.cacheService.set(
        `refresh_token_${user._id}`, 
        tokens.refreshToken, 
        7 * 24 * 60 * 60 // 7 days in seconds
      );

      return {
        success: true,
        message: isNewUser ? 'Phone verified! Please complete your profile' : 'Welcome back!',
        data: {
          user: this.sanitizeUser(user),
          tokens,
          isNewUser
        }
      };

    } catch (error) {
      this.logger.error(`TrueCaller verification error: ${error.message}`, error.stack);
      throw new BadRequestException('Phone verification failed. Please try again.');
    }
  }

  // Get authentication options available
  async getAuthOptions(): Promise<{
    success: boolean;
    data: {
      otp: boolean;
      truecaller: boolean;
      methods: string[];
    };
  }> {
    const otpEnabled = !!(this.configService.get('VEPAAR_API_KEY'));
    const truecallerEnabled = this.truecallerService.isTruecallerEnabled();

    const methods: string[] = [];
    if (otpEnabled) methods.push('otp');
    if (truecallerEnabled) methods.push('truecaller');

    return {
      success: true,
      data: {
        otp: otpEnabled,
        truecaller: truecallerEnabled,
        methods
      }
    };
  }

  // Helper method: Generate phone hash for JWT payload
  private generatePhoneHash(phoneNumber: string): string {
    return crypto.createHash('sha256').update(phoneNumber).digest('hex').substring(0, 16);
  }

  // Helper method: Parse phone number to extract country code
  private parsePhoneNumber(fullPhoneNumber: string): { phoneNumber: string; countryCode: string } {
    if (fullPhoneNumber.startsWith('+91')) {
      return {
        phoneNumber: fullPhoneNumber.substring(3),
        countryCode: '91'
      };
    } else if (fullPhoneNumber.startsWith('+1')) {
      return {
        phoneNumber: fullPhoneNumber.substring(2),
        countryCode: '1'
      };
    } else if (fullPhoneNumber.startsWith('+')) {
      // Generic parsing for other countries
      const match = fullPhoneNumber.match(/^\+(\d{1,4})(\d+)$/);
      if (match) {
        return {
          phoneNumber: match[2],
          countryCode: match[1]
        };
      }
    }
    
    // Default assumption - Indian number
    return {
      phoneNumber: fullPhoneNumber.replace(/^\+?91/, ''),
      countryCode: '91'
    };
  }

  // Helper method: Remove sensitive data from user object
  private sanitizeUser(user: UserDocument): any {
    const userObj = user.toObject();
    delete userObj.phoneHash;
    delete userObj.__v;
    return {
      id: userObj._id,
      phoneNumber: userObj.phoneNumber,
      countryCode: userObj.countryCode,
      name: userObj.name,
      profileImage: userObj.profileImage,
      wallet: userObj.wallet,
      stats: userObj.stats,
      isPhoneVerified: userObj.isPhoneVerified,
      appLanguage: userObj.appLanguage,
      createdAt: userObj.createdAt
    };
  }
}
