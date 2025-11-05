// src/auth/strategies/jwt.strategy.ts (FINAL - COMPLETE)
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>,
    configService: ConfigService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    
    if (!jwtSecret) {
      throw new Error('❌ JWT_SECRET is not defined in environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });

    this.logger.log('🔑 JWT Strategy initialized');
  }

  async validate(payload: any): Promise<any> {
    try {
      this.logger.log('🔐 JWT Validation Started', {
        hasUserId: !!payload.userId,
        has_id: !!payload._id,
        hasAstrologerId: !!payload.astrologerId,
        role: payload.role,
      });

      if (payload.type && payload.type !== 'access') {
        this.logger.error('❌ Invalid token type:', payload.type);
        throw new UnauthorizedException('Invalid token type');
      }

      // ========================================
      // ASTROLOGER TOKEN VALIDATION
      // ========================================
      if (payload.astrologerId || payload.role === 'astrologer') {
        this.logger.log('👨‍⚕️ Validating ASTROLOGER token');
        return await this.validateAstrologer(payload);
      }

      // ========================================
      // REGULAR USER TOKEN VALIDATION
      // ========================================
      this.logger.log('👤 Validating REGULAR USER token');
      return await this.validateUser(payload);

    } catch (error) {
      this.logger.error('❌ JWT Validation Failed:', {
        errorMessage: (error as any).message,
        userId: payload.userId || payload._id,
      });
      throw error;
    }
  }

  /**
   * Validate astrologer token
   * ✅ Uses: accountStatus (active, suspended, inactive)
   */
  private async validateAstrologer(payload: any): Promise<any> {
    try {
      const astrologerId = payload.astrologerId;
      const userId = payload.userId || payload._id;

      this.logger.log('🔍 Astrologer validation: Looking up astrologer', {
        astrologerId,
        userId,
      });

      // Find astrologer
      const astrologer = await this.astrologerModel
        .findById(astrologerId)
        .select('_id name registrationId accountStatus profilePicture availability performance stats');

      if (!astrologer) {
        this.logger.error('❌ Astrologer not found', { astrologerId });
        throw new UnauthorizedException('Astrologer not found');
      }

      // ✅ Check accountStatus (enum: 'active', 'suspended', 'inactive')
      if (astrologer.accountStatus !== 'active') {
        this.logger.error('❌ Astrologer not active', {
          astrologerId,
          accountStatus: astrologer.accountStatus,
        });

        if (astrologer.accountStatus === 'suspended') {
          throw new UnauthorizedException('Astrologer account is suspended');
        } else if (astrologer.accountStatus === 'inactive') {
          throw new UnauthorizedException('Astrologer account is inactive');
        } else {
          throw new UnauthorizedException('Astrologer account not active');
        }
      }

      // Find associated user
      this.logger.log('🔍 Looking up associated user', { userId });
      const user = await this.userModel
        .findById(userId)
        .select('_id phoneNumber status');

      if (!user) {
        this.logger.error('❌ User not found', { userId });
        throw new UnauthorizedException('Associated user not found');
      }

      // ✅ Check user status
      if (user.status !== 'active') {
        this.logger.error('❌ User not active', {
          userId,
          status: user.status,
        });
        throw new UnauthorizedException('User account not active');
      }

      // ✅ Update last active
      user.lastActiveAt = new Date();
      await user.save();

      this.logger.log('✅ Astrologer validated successfully', {
        astrologerId: (astrologer._id as any).toString(),
        astrologerName: astrologer.name,
        accountStatus: astrologer.accountStatus,
        userId: (user._id as any).toString(),
        userPhone: user.phoneNumber,
      });

      return {
        _id: user._id,
        userId: user._id,
        astrologerId: astrologer._id,
        phoneNumber: user.phoneNumber,
        userType: 'astrologer',
        role: 'astrologer',
        name: astrologer.name,
        profilePicture: astrologer.profilePicture,
        isOnline: astrologer.availability?.isOnline || false,
        isLive: astrologer.availability?.isLive || false,
        rating: astrologer.ratings?.average || 0,
      };

    } catch (error) {
      this.logger.error('❌ Astrologer validation failed:', {
        errorMessage: (error as any).message,
        astrologerId: payload.astrologerId,
      });
      throw error;
    }
  }

  /**
   * Validate regular user token
   */
  private async validateUser(payload: any): Promise<any> {
    try {
      const userId = payload.userId || payload._id;
      const { phoneHash } = payload;

      this.logger.log('🔍 User validation: Looking up user', {
        userId,
        hasPhoneHash: !!phoneHash,
      });

      const query: any = {
        _id: userId,
        status: 'active', // ✅ Only active users
      };

      if (phoneHash) {
        query.phoneHash = phoneHash;
        this.logger.log('📝 Phone hash validation enabled');
      }

      const user = await this.userModel
        .findOne(query)
        .select('_id phoneNumber status appLanguage wallet');

      if (!user) {
        // Log detailed error for debugging
        const userExists = await this.userModel.findById(userId);
        
        this.logger.error('❌ User validation failed', {
          userId,
          userExists: !!userExists,
          userStatus: (userExists as any)?.status,
          queryStatus: query.status,
          hasPhoneHash: !!phoneHash,
        });

        throw new UnauthorizedException('User not found or inactive');
      }

      // ✅ Update last active timestamp
      user.lastActiveAt = new Date();
      await user.save();

      this.logger.log('✅ User validated successfully', {
        userId: (user._id as any).toString(),
        phoneNumber: user.phoneNumber,
        status: user.status,
      });

      return {
        _id: user._id,
        userId: user._id,
        phoneNumber: user.phoneNumber,
        userType: 'user',
        role: 'user',
        appLanguage: user.appLanguage,
        wallet: user.wallet,
      };

    } catch (error) {
      this.logger.error('❌ User validation failed:', {
        errorMessage: (error as any).message,
        userId: payload.userId || payload._id,
      });
      throw error;
    }
  }
}
