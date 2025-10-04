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

  // src/auth/auth.service.ts (Replace verifyOtp method with enhanced logging)
async verifyOtp(phoneNumber: string, countryCode: string, otp: string): Promise<{
  success: boolean;
  message: string;
  data: {
    user: any;
    tokens: TokenPair;
    isNewUser: boolean;
  }
}> {
  this.logger.log('🔍 AUTH SERVICE: Starting OTP verification process');
  
  try {
    // Step 1: Log input validation
    this.logger.log('📤 AUTH SERVICE: Input validation', {
      phoneNumber,
      countryCode,
      otpLength: otp.length,
      hasPhoneNumber: !!phoneNumber,
      hasCountryCode: !!countryCode,
      hasOtp: !!otp
    });

    // Step 2: Verify OTP (we know this works)
    this.logger.log('📤 AUTH SERVICE: Calling OtpService.verifyOTP...');
    const isOtpValid = await this.otpService.verifyOTP(phoneNumber, countryCode, otp);
    
    this.logger.log('📥 AUTH SERVICE: OTP validation result:', { isOtpValid });
    
    if (!isOtpValid) {
      this.logger.error('❌ AUTH SERVICE: OTP validation failed');
      throw new BadRequestException('Invalid OTP');
    }

    this.logger.log('✅ AUTH SERVICE: OTP is valid, proceeding with user operations...');

    // Step 3: Process phone number and hash
    this.logger.log('📤 AUTH SERVICE: Processing phone number and hash...');
    const phoneHash = this.otpService.hashPhoneNumber(phoneNumber, countryCode);
    const fullPhoneNumber = `+${countryCode}${phoneNumber}`;

    this.logger.log('✅ AUTH SERVICE: Phone processing completed', {
      originalPhone: phoneNumber,
      fullPhoneNumber,
      phoneHashLength: phoneHash.length,
      phoneHashPreview: phoneHash.substring(0, 8) + '...'
    });

    // Step 4: Database user search
    this.logger.log('📤 AUTH SERVICE: Searching for existing user in database...');
    let user;
    try {
      user = await this.userModel.findOne({ 
        $or: [
          { phoneNumber: phoneNumber }, // Legacy compatibility
          { phoneNumber: fullPhoneNumber }, // New format with country code
          { phoneHash }, // Direct hash match - this will catch existing user
        ]
      }).exec();
      
      this.logger.log('📥 AUTH SERVICE: User search completed', {
        userFound: !!user,
        userId: user?._id?.toString(),
        userPhone: user?.phoneNumber,
        searchCriteria: [phoneNumber, fullPhoneNumber]
      });
    } catch (dbError) {
      this.logger.error('❌ AUTH SERVICE: Database user search failed:', {
        error: dbError.message,
        stack: dbError.stack?.substring(0, 200)
      });
      throw new BadRequestException('Database error during user search');
    }
    
    let isNewUser = false;

    // Step 5: User creation or update
    if (!user) {
      this.logger.log('📤 AUTH SERVICE: Creating new user...');
      try {
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

        this.logger.log('📤 AUTH SERVICE: Saving new user to database...');
        await user.save();
        this.logger.log('✅ AUTH SERVICE: New user created successfully', {
          userId: user._id.toString(),
          phoneNumber: user.phoneNumber
        });
        isNewUser = true;
      } catch (userCreateError) {
        this.logger.error('❌ AUTH SERVICE: User creation failed:', {
          error: userCreateError.message,
          stack: userCreateError.stack?.substring(0, 300),
          validationErrors: userCreateError.errors,
          name: userCreateError.name
        });
        throw new BadRequestException(`Failed to create user: ${userCreateError.message}`);
      }
    } else {
      this.logger.log('📤 AUTH SERVICE: Updating existing user...');
      try {
    // ✅ Only update fields that might have changed, avoid phoneHash conflict
    const updateData: any = {
      isPhoneVerified: true,
      lastLoginAt: new Date(),
      countryCode: countryCode
    };

    // ✅ Only update phoneHash if it's different
    if (user.phoneHash !== phoneHash) {
      updateData.phoneHash = phoneHash;
      this.logger.log('📤 AUTH SERVICE: Updating phoneHash (different from stored)');
    } else {
      this.logger.log('📤 AUTH SERVICE: phoneHash unchanged, skipping update');
    }

    // Use findOneAndUpdate to avoid duplicate key issues
    user = await this.userModel.findOneAndUpdate(
      { _id: user._id },
      updateData,
      { new: true }
    );
    
    this.logger.log('✅ AUTH SERVICE: Existing user updated successfully', {
      userId: user._id.toString()
    });
  } catch (userUpdateError) {
    this.logger.error('❌ AUTH SERVICE: User update failed:', {
      error: userUpdateError.message,
      code: userUpdateError.code,
      stack: userUpdateError.stack?.substring(0, 300)
    });
    
    // ✅ Handle duplicate key error gracefully
    if (userUpdateError.code === 11000 && userUpdateError.message.includes('phoneHash')) {
      this.logger.warn('⚠️ AUTH SERVICE: phoneHash duplicate error ignored (same user)');
      // Continue with the existing user data - this is not a fatal error
    } else {
      throw new BadRequestException(`Failed to update user: ${userUpdateError.message}`);
    }
  }
}

    // Step 6: Generate JWT tokens
    this.logger.log('📤 AUTH SERVICE: Generating JWT tokens...');
    let tokens;
    try {
      tokens = this.jwtAuthService.generateTokenPair(
        user._id as Types.ObjectId,
        user.phoneNumber,
        user.phoneHash
      );
      this.logger.log('✅ AUTH SERVICE: JWT tokens generated successfully', {
        hasAccessToken: !!tokens.accessToken,
        hasRefreshToken: !!tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        accessTokenLength: tokens.accessToken?.length,
        refreshTokenLength: tokens.refreshToken?.length
      });
    } catch (tokenError) {
      this.logger.error('❌ AUTH SERVICE: Token generation failed:', {
        error: tokenError.message,
        stack: tokenError.stack?.substring(0, 300),
        userId: user._id.toString()
      });
      throw new BadRequestException(`Failed to generate tokens: ${tokenError.message}`);
    }

    // Step 7: Store refresh token in cache
    this.logger.log('📤 AUTH SERVICE: Storing refresh token in cache...');
    try {
      await this.cacheService.set(
        `refresh_token_${user._id}`, 
        tokens.refreshToken, 
        7 * 24 * 60 * 60 // 7 days in seconds
      );
      this.logger.log('✅ AUTH SERVICE: Refresh token stored in cache successfully');
    } catch (cacheError) {
      this.logger.error('❌ AUTH SERVICE: Cache storage failed:', {
        error: cacheError.message,
        stack: cacheError.stack?.substring(0, 300),
        userId: user._id.toString()
      });
      // Don't fail the entire process for cache errors
      this.logger.warn('⚠️ AUTH SERVICE: Continuing without cache storage');
    }

    // Step 8: Prepare response
    this.logger.log('📤 AUTH SERVICE: Preparing response...');
    const result = {
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

    this.logger.log('✅ AUTH SERVICE: OTP verification completed successfully', {
      success: result.success,
      message: result.message,
      userId: result.data.user.id,
      isNewUser: result.data.isNewUser,
      responseDataKeys: Object.keys(result.data)
    });
    
    return result;

  } catch (error) {
    this.logger.error('❌ AUTH SERVICE: OTP verification process failed:', {
      errorMessage: error.message,
      errorType: error.constructor.name,
      errorStatus: error.status,
      errorStack: error.stack?.substring(0, 500),
      inputData: {
        phoneNumber,
        countryCode,
        otpLength: otp?.length
      }
    });

    if (error instanceof BadRequestException) {
      throw error;
    }
    
    throw new BadRequestException(`OTP verification failed: ${error.message}`);
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

  async verifyTruecaller(truecallerVerifyDto: TruecallerVerifyDto) {
  try {
    this.logger.log('🔍 Truecaller verification (phone + name only)');

    const verification = await this.truecallerService.verifyOAuthCode(
      truecallerVerifyDto.authorizationCode,
      truecallerVerifyDto.codeVerifier
    );

    if (!verification.success || !verification.userProfile) {
      throw new BadRequestException(verification.message || 'Verification failed');
    }

    const { phoneNumber, countryCode, firstName, lastName } = verification.userProfile;
    const phoneHash = this.generatePhoneHash(phoneNumber);
    const fullName = `${firstName || ''} ${lastName || ''}`.trim() || 'User';

    // Find or create user
    let user = await this.userModel.findOne({ 
      $or: [{ phoneNumber }, { phoneHash }]
    });
    
    let isNewUser = false;

    if (!user) {
      this.logger.log('📤 Creating new user (phone + name)...');
      
      user = new this.userModel({
        phoneNumber,
        phoneHash,
        countryCode: countryCode || '91',
        name: fullName,
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
        favoriteAstrologers: []
      });
      
      await user.save();
      isNewUser = true;
      this.logger.log('✅ New user created');
    } else {
      this.logger.log('📤 Updating existing user...');
      user.isPhoneVerified = true;
      user.lastLoginAt = new Date();
      if (!user.name) user.name = fullName;
      await user.save();
      this.logger.log('✅ User updated');
    }

    // Generate tokens
    const tokens = this.jwtAuthService.generateTokenPair(
      user._id as Types.ObjectId,
      user.phoneNumber,
      phoneHash
    );

    await this.cacheService.set(
      `refresh_token_${(user._id as Types.ObjectId).toString()}`,
      tokens.refreshToken, 
      7 * 24 * 60 * 60
    );

    return {
      success: true,
      message: isNewUser ? 'Welcome to VaidikTalk!' : 'Welcome back!',
      data: {
        user: this.sanitizeUser(user),
        tokens,
        isNewUser
      }
    };

  } catch (error) {
    this.logger.error(`❌ Truecaller error: ${error.message}`);
    throw new BadRequestException('Truecaller login failed. Please use OTP.');
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
      createdAt: userObj.createdAt,
    };
  }
}
