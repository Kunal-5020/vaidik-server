// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { HttpModule } from '@nestjs/axios'; // Added for TrueCaller

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OtpService } from './services/otp/otp.service';
import { JwtAuthService } from './services/jwt-auth/jwt-auth.service';
import { OtpStorageService } from './services/otp/otp-storage.service';
import { TruecallerService } from './services/truecaller.service'; // Added
import { SimpleCacheService } from './services/cache/cache.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OptionalAuthGuard } from './guards/optional-auth.guard';
import { AstrologerAuthService } from './services/astrologer-auth.service';
import { AstrologerAuthController } from './controllers/astrologer-auth.controller';

// Import User schema
import { User, UserSchema } from '../users/schemas/user.schema';
import { Astrologer, AstrologerSchema } from '../astrologers/schemas/astrologer.schema';


@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    HttpModule, // Added for TrueCaller HTTP requests
    
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is not defined');
        }
        return {
          secret,
          signOptions: {
            expiresIn: configService.get('JWT_EXPIRES_IN') || '15m',
          },
        };
      },
      inject: [ConfigService],
    }),

    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Astrologer.name, schema: AstrologerSchema }
    ]),
  ],
  controllers: [
    AuthController,
    AstrologerAuthController],
  providers: [
    AuthService,
    AstrologerAuthService,
    OtpService,
    JwtAuthService,
    OtpStorageService,
    TruecallerService, // Added
    SimpleCacheService, // Added
    JwtStrategy,
    JwtAuthGuard,
    OptionalAuthGuard,
  ],
  exports: [
    AuthService,
    JwtAuthService,
    JwtAuthGuard,
    OptionalAuthGuard,
    OtpService,
    SimpleCacheService, // Export for use in other modules
    PassportModule,
  ],
})
export class AuthModule {}
