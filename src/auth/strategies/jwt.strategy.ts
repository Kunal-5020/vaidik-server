// src/auth/strategies/jwt.strategy.ts

import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { JwtPayload } from '../services/jwt-auth/jwt-auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name); // ✅ ADDED

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    configService: ConfigService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });

    this.logger.log('🔑 JWT Strategy initialized'); // ✅ ADDED
  }

  async validate(payload: JwtPayload): Promise<UserDocument> {
    const { userId, phoneHash, type } = payload;

    // ✅ ADDED: Log payload
    this.logger.log('🔍 Validating JWT payload:', {
      userId,
      phoneHash: phoneHash?.substring(0, 16) + '...',
      type,
      exp: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'N/A',
    });

    // Only allow access tokens for API access
    if (type !== 'access') {
      this.logger.error('❌ Invalid token type:', type);
      throw new UnauthorizedException('Invalid token type');
    }

    // ✅ ADDED: Log search criteria
    this.logger.log('🔍 Looking for user with:', {
      _id: userId,
      phoneHashPrefix: phoneHash?.substring(0, 16) + '...',
      status: 'active',
    });

    // Find user by ID and phoneHash for security
    const user = await this.userModel.findOne({
      _id: userId,
      phoneHash: phoneHash,
      status: 'active',
    });

    if (!user) {
      // ✅ ADDED: Debug - Try finding by ID only
      const userById = await this.userModel.findById(userId);
      
      this.logger.error('❌ User not found with phoneHash', {
        userId,
        phoneHashInToken: phoneHash?.substring(0, 16) + '...',
        userExists: !!userById,
        userPhoneHash: userById?.phoneHash?.substring(0, 16) + '...',
        userStatus: userById?.status,
        phoneHashMatch: userById?.phoneHash === phoneHash,
      });

      throw new UnauthorizedException('User not found or inactive');
    }

    // ✅ ADDED: Log success
    this.logger.log('✅ User validated successfully:', {
      // userId: user._id.toString(),
      phoneNumber: user.phoneNumber,
      status: user.status,
    });

    // Update last active timestamp
    user.lastActiveAt = new Date();
    await user.save();

    return user;
  }
}
