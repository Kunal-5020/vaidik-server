// src/auth/auth.controller.ts (Fixed with Logger and VerifyOtpDto)
import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus, 
  UseGuards, 
  Get, 
  Req,
  Logger, // ✅ Added Logger import
  ValidationPipe 
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { TruecallerService } from './services/truecaller.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto'; // ✅ Using your DTO
import { TruecallerVerifyDto } from './dto/truecaller-verify.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserDocument } from '../users/schemas/user.schema';

interface AuthenticatedRequest extends Request {
  user: UserDocument;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name); // ✅ Added Logger

  constructor(
    private authService: AuthService,
    private readonly truecallerService: TruecallerService,
  ) {}
  
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body(ValidationPipe) sendOtpDto: SendOtpDto) {
    try {
      this.logger.log('🔍 CONTROLLER: Send OTP request received', {
        phoneNumber: sendOtpDto.phoneNumber,
        countryCode: sendOtpDto.countryCode
      });

      const result = await this.authService.sendOtp(sendOtpDto.phoneNumber, sendOtpDto.countryCode);
      
      this.logger.log('✅ CONTROLLER: OTP sent successfully');
      return result;
    } catch (error) {
      this.logger.error('❌ CONTROLLER: Send OTP failed', {
        error: error.message,
        status: error.status
      });
      throw error;
    }
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body(ValidationPipe) sendOtpDto: SendOtpDto) {
    try {
      this.logger.log('🔍 CONTROLLER: Resend OTP request received', {
        phoneNumber: sendOtpDto.phoneNumber,
        countryCode: sendOtpDto.countryCode
      });

      const result = await this.authService.resendOtp(sendOtpDto.phoneNumber, sendOtpDto.countryCode);
      
      this.logger.log('✅ CONTROLLER: OTP resent successfully');
      return result;
    } catch (error) {
      this.logger.error('❌ CONTROLLER: Resend OTP failed', {
        error: error.message,
        status: error.status
      });
      throw error;
    }
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body(ValidationPipe) verifyOtpDto: VerifyOtpDto) {
  try {
    this.logger.log('🔍 CONTROLLER: OTP verification request received', {
      phoneNumber: verifyOtpDto.phoneNumber,
      countryCode: verifyOtpDto.countryCode,
      otpLength: verifyOtpDto.otp?.length,
      hasDeviceInfo: !!(verifyOtpDto.fcmToken && verifyOtpDto.deviceId)
    });

    // ✅ PASS DEVICE INFO
    const result = await this.authService.verifyOtp(
      verifyOtpDto.phoneNumber, 
      verifyOtpDto.countryCode, 
      verifyOtpDto.otp,
      {
        fcmToken: verifyOtpDto.fcmToken,
        deviceId: verifyOtpDto.deviceId,
        deviceType: verifyOtpDto.deviceType,
        deviceName: verifyOtpDto.deviceName,
      }
    );

    this.logger.log('✅ CONTROLLER: OTP verification successful', {
      success: result.success,
      message: result.message,
      userId: result.data?.user?.id,
      isNewUser: result.data?.isNewUser
    });

    return result;
  } catch (error) {
    this.logger.error('❌ CONTROLLER: OTP verification failed', {
      error: error.message,
      status: error.status,
      stack: error.stack?.substring(0, 300),
      requestData: {
        phoneNumber: verifyOtpDto.phoneNumber,
        countryCode: verifyOtpDto.countryCode,
        otpLength: verifyOtpDto.otp?.length
      }
    });
    
    throw error;
  }
}

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body(ValidationPipe) refreshTokenDto: RefreshTokenDto) {
    try {
      this.logger.log('🔍 CONTROLLER: Token refresh request received');
      
      const result = await this.authService.refreshToken(refreshTokenDto.refreshToken);
      
      this.logger.log('✅ CONTROLLER: Token refreshed successfully');
      return result;
    } catch (error) {
      this.logger.error('❌ CONTROLLER: Token refresh failed', {
        error: error.message,
        status: error.status
      });
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: AuthenticatedRequest) {
    try {
      const userId = (req.user._id as any).toString();
      this.logger.log('🔍 CONTROLLER: Logout request received', { userId });
      
      const result = await this.authService.logout(userId);
      
      this.logger.log('✅ CONTROLLER: Logout successful', { userId });
      return result;
    } catch (error) {
      this.logger.error('❌ CONTROLLER: Logout failed', {
        error: error.message,
        status: error.status
      });
      throw error;
    }
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
    try {
      this.logger.log('🔍 CONTROLLER: Auth methods request received');
      
      const result = await this.authService.getAuthOptions();
      
      this.logger.log('✅ CONTROLLER: Auth methods retrieved successfully', {
        methods: result.data.methods
      });
      
      return result;
    } catch (error) {
      this.logger.error('❌ CONTROLLER: Get auth methods failed', {
        error: error.message,
        status: error.status
      });
      throw error;
    }
  }

// TrueCaller verification endpoint
@Post('verify-truecaller')
@HttpCode(HttpStatus.OK)
async verifyTruecaller(@Body(ValidationPipe) truecallerVerifyDto: TruecallerVerifyDto) {
  try {
    this.logger.log('🔍 CONTROLLER: TrueCaller OAuth verification request received', {
      hasAuthCode: !!truecallerVerifyDto.authorizationCode,
      hasCodeVerifier: !!truecallerVerifyDto.codeVerifier,
      hasDeviceInfo: !!(truecallerVerifyDto.fcmToken && truecallerVerifyDto.deviceId)
    });

    // ✅ EXTRACT DEVICE INFO
    const deviceInfo = {
      fcmToken: truecallerVerifyDto.fcmToken,
      deviceId: truecallerVerifyDto.deviceId,
      deviceType: truecallerVerifyDto.deviceType,
      deviceName: truecallerVerifyDto.deviceName,
    };

    const result = await this.authService.verifyTruecaller(truecallerVerifyDto, deviceInfo);
    
    this.logger.log('✅ CONTROLLER: TrueCaller verification successful', {
      userId: result.data?.user?.id,
      isNewUser: result.data?.isNewUser,
      userName: result.data?.user?.name,
      phoneNumber: result.data?.user?.phoneNumber
    });
    
    return result;
  } catch (error) {
    this.logger.error('❌ CONTROLLER: TrueCaller verification failed', {
      error: error.message,
      status: error.status,
      stack: error.stack?.substring(0, 200)
    });
    throw error;
  }
}

// src/auth/auth.controller.ts - Replace these two methods

/**
 * Get Truecaller configuration for frontend
 * Public endpoint - no authentication required
 * Frontend can use this to check if Truecaller is enabled
 */
@Get('truecaller/config')
async getTruecallerConfig() {
  try {
    this.logger.log('🔍 CONTROLLER: TrueCaller config request received');

    const config = this.truecallerService.getTruecallerConfig();

    this.logger.log('✅ CONTROLLER: TrueCaller config retrieved', {
      isEnabled: config.isEnabled,
      flowType: config.flowType,
      dataFieldsCount: config.dataFields?.length,
    });

    return {
      success: true,
      data: config,
    };
  } catch (error) {
    this.logger.error('❌ CONTROLLER: Get TrueCaller config failed', {
      error: error.message,
      stack: error.stack?.substring(0, 200),
    });

    // Don't expose internal errors to frontend
    return {
      success: false,
      message: 'Failed to retrieve Truecaller configuration',
      data: {
        isEnabled: false,
        flowType: 'oauth',
        dataFields: [],
      },
    };
  }
}

/**
 * Test Truecaller configuration
 * Useful for debugging and health checks
 * Public endpoint - no authentication required
 */
@Get('truecaller/test')
async testTruecallerConfig() {
  try {
    this.logger.log('🧪 CONTROLLER: TrueCaller test request received');

    const result = await this.truecallerService.testConfiguration();

    this.logger.log('🧪 CONTROLLER: TrueCaller test completed', {
      success: result.success,
      message: result.message,
      isEnabled: result.config?.isEnabled,
    });

    return result;
  } catch (error) {
    this.logger.error('❌ CONTROLLER: TrueCaller test failed', {
      error: error.message,
      stack: error.stack?.substring(0, 200),
    });

    return {
      success: false,
      message: `Test failed: ${error.message}`,
      config: {
        isEnabled: false,
        flowType: 'oauth',
        dataFields: [],
        hasClientId: false,
      },
    };
  }
}

}
