// src/auth/auth.service.ts (COMPLETE - FIXED)
import { 
  Injectable, 
  BadRequestException, 
  UnauthorizedException, 
  Logger 
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { User, UserDocument } from '../users/schemas/user.schema';
import { OtpService } from './services/otp/otp.service';
import { TruecallerService } from './services/truecaller.service';
import { JwtAuthService, TokenPair } from './services/jwt-auth/jwt-auth.service';
import { SimpleCacheService } from './services/cache/cache.service';
import { TruecallerVerifyDto } from './dto/truecaller-verify.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly countryCurrencyMap: { [key: string]: string } = {
    '91': 'INR', '1': 'USD', '44': 'GBP', '61': 'AUD', '64': 'NZD',
    '33': 'EUR', '34': 'EUR', '39': 'EUR', '49': 'EUR', '31': 'EUR',
    '32': 'EUR', '43': 'EUR', '358': 'EUR', '351': 'EUR', '353': 'EUR',
    '30': 'EUR', '41': 'CHF', '46': 'SEK', '47': 'NOK', '45': 'DKK',
    '48': 'PLN', '420': 'CZK', '36': 'HUF', '40': 'RON', '86': 'CNY',
    '81': 'JPY', '82': 'KRW', '66': 'THB', '84': 'VND', '63': 'PHP',
    '62': 'IDR', '60': 'MYR', '65': 'SGD', '852': 'HKD', '886': 'TWD',
    '92': 'PKR', '880': 'BDT', '94': 'LKR', '977': 'NPR', '95': 'MMK',
    '971': 'AED', '966': 'SAR', '974': 'QAR', '965': 'KWD', '968': 'OMR',
    '973': 'BHD', '972': 'ILS', '90': 'TRY', '20': 'EGP', '27': 'ZAR',
    '234': 'NGN', '254': 'KES', '233': 'GHS', '255': 'TZS', '256': 'UGX',
    '55': 'BRL', '54': 'ARS', '52': 'MXN', '56': 'CLP', '57': 'COP',
    '51': 'PEN', '58': 'VES', '7': 'RUB', '380': 'UAH',
  };

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private otpService: OtpService,
    private jwtAuthService: JwtAuthService,
    private truecallerService: TruecallerService,
    private configService: ConfigService,
    private cacheService: SimpleCacheService,
  ) {}

  private getCurrencyFromCountryCode(countryCode: string): string {
    const currency = this.countryCurrencyMap[countryCode];
    if (!currency) {
      this.logger.warn(`⚠️ Unknown country code: ${countryCode}, defaulting to INR`);
      return 'INR';
    }
    this.logger.log(`✅ Currency mapped: ${countryCode} → ${currency}`);
    return currency;
  }

  async sendOtp(phoneNumber: string, countryCode: string) {
    try {
      const result = await this.otpService.sendOTP(phoneNumber, countryCode);
      return {
        success: true,
        message: result.message,
        data: {
          phoneNumber,
          countryCode,
          expiryTime: 600,
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
          expiryTime: 600,
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
  this.logger.log('🔍 AUTH SERVICE: Starting OTP verification process');
  
  try {
    this.logger.log('📤 AUTH SERVICE: Input validation', {
      phoneNumber,
      countryCode,
      otpLength: otp.length,
    });

    const isOtpValid = await this.otpService.verifyOTP(phoneNumber, countryCode, otp);
    
    if (!isOtpValid) {
      this.logger.error('❌ AUTH SERVICE: OTP validation failed');
      throw new BadRequestException('Invalid OTP');
    }

    this.logger.log('✅ AUTH SERVICE: OTP is valid');

    const phoneHash = this.otpService.hashPhoneNumber(phoneNumber, countryCode);
    const fullPhoneNumber = `+${countryCode}${phoneNumber}`;
    const currency = this.getCurrencyFromCountryCode(countryCode);

    this.logger.log('✅ AUTH SERVICE: Phone processing completed', {
      fullPhoneNumber,
      countryCode,
      currency,
    });

    this.logger.log('📤 AUTH SERVICE: Searching for existing user...');
    let user = await this.userModel.findOne({ 
      $or: [
        { phoneNumber: phoneNumber },
        { phoneNumber: fullPhoneNumber },
        { phoneHash },
      ]
    }).exec();
    
    this.logger.log('📥 AUTH SERVICE: User search completed', {
      userFound: !!user,
      userId: user ? (user._id as any).toString() : 'N/A',
      userStatus: user?.status,
    });
    
    let isNewUser = false;

    if (!user) {
      this.logger.log('📤 AUTH SERVICE: Creating new user...');
      user = new this.userModel({
        phoneNumber: fullPhoneNumber,
        phoneHash,
        countryCode,
        isPhoneVerified: true,
        status: 'active',
        appLanguage: 'en',
        registrationMethod: 'otp',
        wallet: {
          balance: 0,
          totalRecharged: 0,
          totalSpent: 0,
          currency: currency,
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
      this.logger.log('✅ AUTH SERVICE: New user created', {
        userId: (user._id as any).toString(),
        phoneNumber: user.phoneNumber,
      });
      isNewUser = true;
    } else {
      this.logger.log('📤 AUTH SERVICE: Existing user found, checking status...');
      
      // ✅ REACTIVATE deleted/inactive users
      if (user.status === 'deleted' || user.status === 'inactive') {
        this.logger.log(`♻️ AUTH SERVICE: Reactivating ${user.status} user: ${user.phoneNumber}`);
        user.status = 'active';
      }

      const updateData: any = {
        isPhoneVerified: true,
        lastLoginAt: new Date(),
        countryCode: countryCode,
        status: 'active',
      };

      if (user.phoneHash !== phoneHash) {
        updateData.phoneHash = phoneHash;
      }

      try {
        user = await this.userModel.findOneAndUpdate(
          { _id: user._id },
          updateData,
          { new: true }
        );
        
        // ✅ FIX: Add null check after update
        if (!user) {
          throw new BadRequestException('User update returned null');
        }
        
        this.logger.log('✅ AUTH SERVICE: Existing user updated', {
          userId: (user._id as any).toString(),
          status: user.status,
        });
      } catch (userUpdateError) {
        if ((userUpdateError as any).code === 11000 && (userUpdateError as any).message.includes('phoneHash')) {
          this.logger.warn('⚠️ AUTH SERVICE: phoneHash duplicate (same user)');
        } else {
          throw new BadRequestException(`Failed to update user: ${(userUpdateError as any).message}`);
        }
      }
    }

    // ✅ FIX: Add null check before using user
    if (!user) {
      throw new BadRequestException('User not found after creation/update');
    }

    this.logger.log('📤 AUTH SERVICE: Generating JWT tokens...');
    const tokens = this.jwtAuthService.generateTokenPair(
      user._id as Types.ObjectId,
      user.phoneNumber,
      user.phoneHash
    );

    try {
      await this.cacheService.set(
        `refresh_token_${(user._id as any).toString()}`, 
        tokens.refreshToken, 
        7 * 24 * 60 * 60
      );
      this.logger.log('✅ AUTH SERVICE: Refresh token stored');
    } catch (cacheError) {
      this.logger.warn('⚠️ AUTH SERVICE: Cache storage failed, continuing');
    }

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
          isProfileComplete: user.isProfileComplete,
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

    this.logger.log('✅ AUTH SERVICE: OTP verification completed', {
      userId: result.data.user.id,
      isNewUser: result.data.isNewUser,
    });
    
    return result;

  } catch (error) {
    this.logger.error('❌ AUTH SERVICE: OTP verification failed:', {
      errorMessage: (error as any).message,
      errorType: (error as any).constructor.name,
    });

    if (error instanceof BadRequestException) {
      throw error;
    }
    
    throw new BadRequestException(`OTP verification failed: ${(error as any).message}`);
  }
}

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
      // ✅ DON'T change user status on logout
      await this.cacheService.del(`refresh_token_${userId}`);

      this.logger.log('✅ AUTH SERVICE: User logged out', { userId });

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
      this.logger.log('🔍 Truecaller verification started');

      const verification = await this.truecallerService.verifyOAuthCode(
        truecallerVerifyDto.authorizationCode,
        truecallerVerifyDto.codeVerifier
      );

      if (!verification.success || !verification.userProfile) {
        this.logger.error('❌ Truecaller verification failed');
        throw new BadRequestException(
          verification.message || 'Truecaller verification failed'
        );
      }

      this.logger.log('✅ Truecaller verification successful');

      const { phoneNumber, countryCode, firstName, lastName } = verification.userProfile;
      const phoneHash = this.generatePhoneHash(phoneNumber);
      const fullName = `${firstName || ''} ${lastName || ''}`.trim() || 'User';
      const currency = this.getCurrencyFromCountryCode(countryCode);

      this.logger.log('📊 User profile data:', { phoneNumber, name: fullName });

      let user = await this.userModel.findOne({
        $or: [{ phoneNumber }, { phoneHash }],
      });

      let isNewUser = false;

      if (!user) {
        this.logger.log('📤 Creating new user with Truecaller data...');

        user = new this.userModel({
          phoneNumber,
          phoneHash,
          countryCode: countryCode,
          name: fullName,
          isPhoneVerified: true,
          registrationMethod: 'truecaller',
          status: 'active', // ✅ SET TO ACTIVE
          appLanguage: 'en',
          wallet: {
            balance: 0,
            currency: currency,
            totalSpent: 0,
            totalRecharged: 0,
          },
          stats: {
            totalSessions: 0,
            totalMinutesSpent: 0,
            totalAmount: 0,
            totalRatings: 0,
          },
          orders: [],
          walletTransactions: [],
          remedies: [],
          reports: [],
          favoriteAstrologers: [],
        });

        await user.save();
        isNewUser = true;

        this.logger.log('✅ New user created via Truecaller', {
          userId: (user._id as Types.ObjectId).toString(),
          name: fullName,
        });
      } else {
        this.logger.log('📤 Updating existing user...');

        // ✅ REACTIVATE deleted/inactive users
        if (user.status === 'deleted' || user.status === 'inactive') {
          this.logger.log(`♻️ Reactivating ${user.status} user: ${user.phoneNumber}`);
          user.status = 'active';
        }

        user.isPhoneVerified = true;
        user.lastLoginAt = new Date();

        if (!user.name || user.name === 'User') {
          user.name = fullName;
        }

        await user.save();

        this.logger.log('✅ Existing user updated', {
          userId: (user._id as Types.ObjectId).toString(),
          status: user.status,
        });
      }

      this.logger.log('🔐 Generating JWT tokens...');
      const tokens = this.jwtAuthService.generateTokenPair(
        user._id as Types.ObjectId,
        user.phoneNumber,
        user.phoneHash
      );

      await this.cacheService.set(
        `refresh_token_${(user._id as Types.ObjectId).toString()}`,
        tokens.refreshToken,
        7 * 24 * 60 * 60
      );

      this.logger.log('✅ Truecaller authentication successful', {
        userId: (user._id as Types.ObjectId).toString(),
        isNewUser,
      });

      return {
        success: true,
        message: isNewUser ? 'Welcome to VaidikTalk!' : 'Welcome back!',
        data: {
          user: this.sanitizeUser(user),
          tokens,
          isNewUser,
        },
      };
    } catch (error) {
      this.logger.error('❌ Truecaller authentication failed:', {
        message: error.message,
      });

      throw new BadRequestException(
        error.message || 'Truecaller login failed. Please use OTP login.'
      );
    }
  }

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

  private generatePhoneHash(phoneNumber: string): string {
    return crypto.createHash('sha256').update(phoneNumber).digest('hex').substring(0, 16);
  }

  private sanitizeUser(user: UserDocument): any {
    const userObj = user.toObject();
    delete userObj.phoneHash;
    delete userObj.__v;
    return {
      id: userObj._id,
      phoneNumber: userObj.phoneNumber,
      countryCode: userObj.countryCode,
      name: userObj.name,
      isProfileComplete: userObj.isProfileComplete,
      profileImage: userObj.profileImage,
      wallet: userObj.wallet,
      stats: userObj.stats,
      isPhoneVerified: userObj.isPhoneVerified,
      appLanguage: userObj.appLanguage,
      createdAt: userObj.createdAt,
    };
  }
}
