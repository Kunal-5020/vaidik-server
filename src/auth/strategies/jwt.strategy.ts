import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { JwtPayload } from '../services/jwt-auth/jwt-auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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
  }

  async validate(payload: JwtPayload): Promise<UserDocument> {
    const { userId, phoneHash, type } = payload;

    // Only allow access tokens for API access
    if (type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Find user by ID and phoneHash for security
    const user = await this.userModel.findOne({
      _id: userId,
      phoneHash: phoneHash,
      status: 'active',
    });

    if (!user) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Update last active timestamp
    user.lastActiveAt = new Date();
    await user.save();

    return user;
  }
}
