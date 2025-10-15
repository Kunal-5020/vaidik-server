import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';

export interface JwtPayload {
  userId: string;
  phoneNumber: string;
  phoneHash: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class JwtAuthService {
  constructor(
    private nestJwtService: NestJwtService,
    private configService: ConfigService,
  ) {}

  // Generate access token (15 minutes)
  generateAccessToken(userId: Types.ObjectId, phoneNumber: string, phoneHash: string): string {
    const payload: JwtPayload = {
      userId: userId.toString(),
      phoneNumber,
      phoneHash,
      type: 'access',
    };

    return this.nestJwtService.sign(payload, {
      secret: this.configService.get('JWT_SECRET'),
      expiresIn: '1d',
    });
  }

  // Generate refresh token (7 days)
  generateRefreshToken(userId: Types.ObjectId, phoneNumber: string, phoneHash: string): string {
    const payload: JwtPayload = {
      userId: userId.toString(),
      phoneNumber,
      phoneHash,
      type: 'refresh',
    };

    return this.nestJwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });
  }

  // Generate both tokens
  generateTokenPair(userId: Types.ObjectId, phoneNumber: string, phoneHash: string): TokenPair {
    const accessToken = this.generateAccessToken(userId, phoneNumber, phoneHash);
    const refreshToken = this.generateRefreshToken(userId, phoneNumber, phoneHash);

    return {
      accessToken,
      refreshToken,
      expiresIn: 60 * 60 * 24, // 15 minutes in seconds
    };
  }

  // Verify access token
  verifyAccessToken(token: string): JwtPayload {
    try {
      return this.nestJwtService.verify(token, {
        secret: this.configService.get('JWT_SECRET'),
      });
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }

  // Verify refresh token
  verifyRefreshToken(token: string): JwtPayload {
    try {
      return this.nestJwtService.verify(token, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  // Refresh access token using refresh token
  refreshAccessToken(refreshToken: string): { accessToken: string; refreshToken: string; expiresIn: number } {
    try {
      const payload = this.verifyRefreshToken(refreshToken);
      
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      const newAccessToken = this.generateAccessToken(
        new Types.ObjectId(payload.userId),
        payload.phoneNumber,
        payload.phoneHash
      );

      const newRefreshToken = this.generateRefreshToken(
        new Types.ObjectId(payload.userId),
        payload.phoneNumber,
        payload.phoneHash
      );

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 60 * 60 * 24,
      };

    } catch (error) {
      throw new Error('Failed to refresh token');
    }
  }
}
