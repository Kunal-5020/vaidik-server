// src/auth/auth.controller.ts
import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus, 
  UseGuards, 
  Get, 
  Req 
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { TruecallerService } from './services/truecaller.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { TruecallerVerifyDto } from './dto/truecaller-verify.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserDocument } from '../users/schemas/user.schema';

interface AuthenticatedRequest extends Request {
  user: UserDocument;
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private readonly truecallerService: TruecallerService,
  ) {}
  
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.sendOtp(sendOtpDto.phoneNumber, sendOtpDto.countryCode);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.resendOtp(sendOtpDto.phoneNumber, sendOtpDto.countryCode);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(
      verifyOtpDto.phoneNumber, 
      verifyOtpDto.countryCode, 
      verifyOtpDto.otp
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: AuthenticatedRequest) {
    const userId = (req.user._id as any).toString();
    return this.authService.logout(userId);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: AuthenticatedRequest) {
    return {
      success: true,
      data: {
        id: req.user._id,
        phoneNumber: req.user.phoneNumber,
        countryCode: req.user.countryCode,
        name: req.user.name,
        gender: req.user.gender,
        profileImage: req.user.profileImage,
        wallet: req.user.wallet,
        stats: req.user.stats,
        status: req.user.status,
        appLanguage: req.user.appLanguage,
        notifications: req.user.notifications,
        privacy: req.user.privacy,
        lastLoginAt: req.user.lastLoginAt,
        createdAt: req.user.createdAt
      }
    };
  }

  @Get('check')
  @UseGuards(JwtAuthGuard)
  async checkAuth(@Req() req: AuthenticatedRequest) {
    return {
      success: true,
      authenticated: true,
      userId: req.user._id,
      phoneNumber: req.user.phoneNumber
    };
  }

  @Get('methods')
  async getAuthMethods() {
    return this.authService.getAuthOptions();
  }

  // TrueCaller verification endpoint
  @Post('verify-truecaller')
  @HttpCode(HttpStatus.OK)
  async verifyTruecaller(@Body() truecallerVerifyDto: TruecallerVerifyDto) {
    return this.authService.verifyTruecaller(truecallerVerifyDto);
  }

  // Get TrueCaller config for frontend
  @Get('truecaller/config')
  async getTruecallerConfig() {
    const config = this.truecallerService.getTruecallerConfig();
    
    return {
      success: true,
      data: config
    };
  }

  // Test TrueCaller configuration
  @Get('truecaller/test')
  async testTruecallerConfig() {
    return this.truecallerService.testConfiguration();
  }
}
