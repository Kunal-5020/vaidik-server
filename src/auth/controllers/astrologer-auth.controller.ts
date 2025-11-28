import { 
  Controller, 
  Post, 
  Body, 
  HttpCode, 
  HttpStatus, 
  Logger,
  ValidationPipe,
  UseGuards,
  Request
} from '@nestjs/common';
import { AstrologerAuthService } from '../services/astrologer-auth.service';
import { SendOtpDto } from '../dto/send-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { TruecallerVerifyDto } from '../dto/truecaller-verify.dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';

@Controller('auth/astrologer')
export class AstrologerAuthController {
  private readonly logger = new Logger(AstrologerAuthController.name);

  constructor(private astrologerAuthService: AstrologerAuthService) {}

  /**
   * Check if phone number has approved astrologer account
   */
  @Post('check-phone')
  @HttpCode(HttpStatus.OK)
  async checkPhone(@Body() body: { phoneNumber: string; countryCode: string }) {
    try {
      this.logger.log('🔍 Checking phone for astrologer account');

      const result = await this.astrologerAuthService.checkPhoneForLogin(
        body.phoneNumber,
        body.countryCode
      );

      return result;
    } catch (error) {
      this.logger.error('❌ Phone check failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Send OTP for astrologer login
   */
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body(ValidationPipe) sendOtpDto: SendOtpDto) {
    try {
      this.logger.log('📤 Sending OTP to astrologer');

      const result = await this.astrologerAuthService.sendLoginOtp(sendOtpDto);
      
      return result;
    } catch (error) {
      this.logger.error('❌ Send OTP failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify OTP and login astrologer
   */
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body(ValidationPipe) verifyOtpDto: VerifyOtpDto) {
    try {
      this.logger.log('🔍 Verifying OTP for astrologer');

      const result = await this.astrologerAuthService.verifyLoginOtp(verifyOtpDto);
      
      this.logger.log('✅ Astrologer login successful');

      return result;
    } catch (error) {
      this.logger.error('❌ OTP verification failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Refresh astrologer token
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() body: { refreshToken: string }) {
    try {
      this.logger.log('🔄 Refreshing astrologer token');

      const result = await this.astrologerAuthService.refreshToken(body.refreshToken);
      
      return result;
    } catch (error) {
      this.logger.error('❌ Token refresh failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Logout astrologer
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req, @Body() body?: { deviceId?: string }) {
    try {
      const userId = req.user.userId;
      const astrologerId = req.user.astrologerId;
      const deviceId = body?.deviceId;

      this.logger.log('🚪 Logging out astrologer', { userId, astrologerId, deviceId });

      const result = await this.astrologerAuthService.logout(userId, astrologerId, deviceId);
      
      return result;
    } catch (error) {
      this.logger.error('❌ Logout failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get current astrologer profile (check if logged in)
   */
  @Post('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getCurrentAstrologer(@Request() req) {
    try {
      return {
        success: true,
        data: {
          userId: req.user.userId,
          astrologerId: req.user.astrologerId,
          phoneNumber: req.user.phoneNumber,
          role: req.user.role
        }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Verify Truecaller OAuth for astrologer login/registration
   */
  @Post('verify-truecaller')
  @HttpCode(HttpStatus.OK)
  async verifyTruecaller(@Body(ValidationPipe) truecallerVerifyDto: TruecallerVerifyDto) {
    try {
      this.logger.log('🔍 Verifying Truecaller for astrologer', {
        hasAuthCode: !!truecallerVerifyDto.authorizationCode,
        hasCodeVerifier: !!truecallerVerifyDto.codeVerifier,
        hasDeviceInfo: !!(truecallerVerifyDto.fcmToken && truecallerVerifyDto.deviceId)
      });

      const deviceInfo = {
        fcmToken: truecallerVerifyDto.fcmToken,
        deviceId: truecallerVerifyDto.deviceId,
        deviceType: truecallerVerifyDto.deviceType,
        deviceName: truecallerVerifyDto.deviceName,
      };

      const result = await this.astrologerAuthService.verifyTruecaller(truecallerVerifyDto, deviceInfo);

      this.logger.log('✅ Truecaller verification result for astrologer', {
        success: result.success,
        message: result.message,
        astrologerId: result.data?.astrologer?.id
      });

      return result;
    } catch (error) {
      this.logger.error('❌ Truecaller verification failed for astrologer', { error: error.message });
      throw error;
    }
  }
}
