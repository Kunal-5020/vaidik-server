import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Astrologer, AstrologerDocument } from '../../astrologers/schemas/astrologer.schema';
import { JwtPayload } from '../services/jwt-auth/jwt-auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Astrologer.name) private astrologerModel: Model<AstrologerDocument>, // ✅ ADD THIS
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

    this.logger.log('🔑 JWT Strategy initialized');
  }

  async validate(payload: any): Promise<any> {
    // ✅ Log full payload
    this.logger.log('🔍 Validating JWT payload:', {
      _id: payload._id,
      userId: payload.userId,
      astrologerId: payload.astrologerId,
      role: payload.role,
      type: payload.type,
    });

    // ✅ HANDLE ASTROLOGER TOKENS
    if (payload.astrologerId || payload.role === 'astrologer') {
      this.logger.log('🔍 Validating astrologer token');

      const astrologer = await this.astrologerModel.findOne({
        _id: payload.astrologerId,
        accountStatus: 'active',
      });

      if (!astrologer) {
        this.logger.error('❌ Astrologer not found or inactive:', payload.astrologerId);
        throw new UnauthorizedException('Astrologer not found or inactive');
      }

      this.logger.log('✅ Astrologer validated:', {
        astrologerId: (astrologer._id as any).toString(), // ✅ CAST TO any first
        name: astrologer.name,
        status: astrologer.accountStatus,
      });

      // ✅ Return with string IDs
      return {
        _id: payload._id || payload.userId,
        userId: payload._id || payload.userId,
        astrologerId: (astrologer._id as any).toString(), // ✅ Return as string
        role: 'astrologer',
        astrologer: astrologer,
      };
    }

    // ✅ HANDLE REGULAR USER TOKENS
    const { userId, phoneHash, type } = payload;

    if (type && type !== 'access') {
      this.logger.error('❌ Invalid token type:', type);
      throw new UnauthorizedException('Invalid token type');
    }

    this.logger.log('🔍 Looking for regular user with:', {
      _id: userId || payload._id,
      phoneHashPrefix: phoneHash?.substring(0, 16) + '...',
      status: 'active',
    });

    const user = await this.userModel.findOne({
      _id: userId || payload._id,
      ...(phoneHash ? { phoneHash } : {}),
      status: 'active',
    });

    if (!user) {
      const userById = await this.userModel.findById(userId || payload._id);
      
      this.logger.error('❌ User not found', {
        userId: userId || payload._id,
        userExists: !!userById,
        userStatus: userById?.status,
      });

      throw new UnauthorizedException('User not found or inactive');
    }

    this.logger.log('✅ User validated successfully:', {
      userId: (user._id as any).toString(), // ✅ CAST TO any first
      phoneNumber: user.phoneNumber,
      status: user.status,
    });

    // Update last active
    user.lastActiveAt = new Date();
    await user.save();

    return user;
  }
}
