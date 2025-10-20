import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';

export interface JwtPayload {
  userId: string;
  phoneNumber: string;
  phoneHash?: string;
  astrologerId?: string;
  role?: string;
  type: 'access' | 'refresh' | 'astrologer';
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType?: string;
}

@Injectable()
export class JwtAuthService {
  constructor(
    private nestJwtService: NestJwtService,
    private configService: ConfigService,
  ) {}

  // ========== USER TOKEN METHODS ==========

  // Generate access token for users
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

  // Generate refresh token for users
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

  // Generate both tokens for users
  generateTokenPair(userId: Types.ObjectId, phoneNumber: string, phoneHash: string): TokenPair {
    const accessToken = this.generateAccessToken(userId, phoneNumber, phoneHash);
    const refreshToken = this.generateRefreshToken(userId, phoneNumber, phoneHash);

    return {
      accessToken,
      refreshToken,
      expiresIn: 60 * 60 * 24, // 1 day in seconds
      tokenType: 'Bearer'
    };
  }

  // ========== ASTROLOGER TOKEN METHODS ==========

  /**
 * Generate tokens for astrologers (includes astrologerId)
 */
generateAstrologerTokens(
  userId: Types.ObjectId,
  astrologerId: Types.ObjectId,
  phoneNumber: string,
  role: string
): TokenPair {
  const accessPayload = {
    _id: userId.toString(), // ✅ ADD THIS - JWT Strategy looks for this
    sub: userId.toString(),
    userId: userId.toString(),
    astrologerId: astrologerId.toString(),
    phoneNumber,
    role,
    type: 'access'
  };

  const refreshPayload = {
    _id: userId.toString(), // ✅ ADD THIS
    sub: userId.toString(),
    userId: userId.toString(),
    astrologerId: astrologerId.toString(),
    phoneNumber,
    role,
    type: 'refresh'
  };

  const accessToken = this.nestJwtService.sign(accessPayload, {
    secret: this.configService.get('JWT_SECRET'),
    expiresIn: '7d',
  });

  const refreshToken = this.nestJwtService.sign(refreshPayload, {
    secret: this.configService.get('JWT_REFRESH_SECRET'),
    expiresIn: '30d',
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
    tokenType: 'Bearer',
  };
}

/**
 * Refresh astrologer access token
 */
refreshAstrologerToken(refreshToken: string): TokenPair {
  try {
    const payload = this.verifyRefreshToken(refreshToken);
    
    if (!payload.astrologerId) {
      throw new Error('Invalid token: Not an astrologer token');
    }

    const newAccessToken = this.nestJwtService.sign(
      {
        _id: payload.userId, // ✅ ADD THIS
        sub: payload.userId,
        userId: payload.userId,
        astrologerId: payload.astrologerId,
        phoneNumber: payload.phoneNumber,
        role: payload.role,
        type: 'access'
      },
      {
        secret: this.configService.get('JWT_SECRET'),
        expiresIn: '7d',
      }
    );

    const newRefreshToken = this.nestJwtService.sign(
      {
        _id: payload.userId, // ✅ ADD THIS
        sub: payload.userId,
        userId: payload.userId,
        astrologerId: payload.astrologerId,
        phoneNumber: payload.phoneNumber,
        role: payload.role,
        type: 'refresh'
      },
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: '30d',
      }
    );

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 7 * 24 * 60 * 60,
      tokenType: 'Bearer'
    };
  } catch (error) {
    throw new Error('Failed to refresh astrologer token');
  }
}


  // ========== VERIFICATION METHODS ==========

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

  // ========== USER REFRESH TOKEN METHOD ==========

  /**
   * Refresh access token using refresh token (for regular users)
   * ✅ FIXED: Handle optional phoneHash properly
   */
  refreshAccessToken(refreshToken: string): { accessToken: string; refreshToken: string; expiresIn: number } {
    try {
      const payload = this.verifyRefreshToken(refreshToken);
      
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // ✅ FIX: Provide default value for phoneHash if undefined
      const phoneHash = payload.phoneHash || ''; // Default to empty string

      const newAccessToken = this.generateAccessToken(
        new Types.ObjectId(payload.userId),
        payload.phoneNumber,
        phoneHash // ✅ Now always a string
      );

      const newRefreshToken = this.generateRefreshToken(
        new Types.ObjectId(payload.userId),
        payload.phoneNumber,
        phoneHash // ✅ Now always a string
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
