import { 
  Injectable, 
  BadRequestException, 
  HttpException, 
  HttpStatus,
  Logger 
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';
import { OtpStorageService } from '../otp/otp-storage.service';
const FormData = require('form-data');

// Custom TooManyRequestsException
export class TooManyRequestsException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly VEPAAR_API_URL = 'https://api.vepaar.com/api/v1/send-otp';

  constructor(
    private configService: ConfigService,
    private otpStorage: OtpStorageService,
  ) {
    this.logger.log('🔐 OTP Service initialized with Vepaar API');
  }

  // Generate 6-digit OTP
  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Hash phone number with country code for privacy
  hashPhoneNumber(phoneNumber: string, countryCode: string): string {
    const fullNumber = `${countryCode}${phoneNumber}`;
    return crypto.createHash('sha256').update(fullNumber).digest('hex');
  }

  // Validate phone number based on country code
  private validatePhoneNumber(phoneNumber: string, countryCode: string): boolean {
    const validationRules = {
      '91': /^[6-9]\d{9}$/, // India: 10 digits starting with 6-9
      '1': /^[2-9]\d{9}$/, // US/Canada: 10 digits
    };

    const rule = validationRules[countryCode];
    if (!rule) {
      return /^[0-9]{7,15}$/.test(phoneNumber);
    }

    return rule.test(phoneNumber);
  }

  // FIXED: Send OTP via Vepaar API (Exact Implementation)
  async sendOTP(
    phoneNumber: string, 
    countryCode: string
  ): Promise<{ success: boolean; message: string; otp?: string }> {
    try {
      // Validate phone number
      if (!this.validatePhoneNumber(phoneNumber, countryCode)) {
        throw new BadRequestException(
          `Invalid phone number format for country code +${countryCode}`
        );
      }

      // Check rate limiting
      const rateCheck = this.otpStorage.checkRateLimit(phoneNumber, countryCode);
      if (!rateCheck.allowed) {
        throw new TooManyRequestsException(rateCheck.message);
      }

      // Generate OTP
      const otp = this.generateOTP();
      
      this.logger.log(`🔐 Generated OTP: ${otp} for +${countryCode}${phoneNumber}`);
      
      // Store OTP
      this.otpStorage.storeOTP(phoneNumber, countryCode, otp, 10); // 10 minutes

      // FIXED: Send via Vepaar API - Exact as specified
      const otpSent = await this.sendVepaarOTP(phoneNumber, countryCode, otp);
      
      if (!otpSent && this.configService.get('NODE_ENV') === 'production') {
        throw new BadRequestException('Failed to send OTP via WhatsApp. Please try again.');
      }

      return {
        success: true,
        message: otpSent 
          ? 'OTP sent to your WhatsApp successfully' 
          : 'OTP generated (development mode)',
        ...(this.configService.get('NODE_ENV') === 'development' && { otp })
      };

    } catch (error) {
      this.logger.error('❌ OTP Send Error:', error);
      
      if (error instanceof TooManyRequestsException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Failed to send OTP. Please try again.');
    }
  }

  // FIXED: Exact Vepaar API implementation as per documentation
  private async sendVepaarOTP(
    phoneNumber: string, 
    countryCode: string, 
    otp: string
  ): Promise<boolean> {
    try {
      // Create mobileNumberWithCallingCode exactly as specified
      const mobileNumberWithCallingCode = `${countryCode}${phoneNumber}`;
      
      this.logger.log(`📞 Sending OTP ${otp} to ${mobileNumberWithCallingCode} via Vepaar API`);

      // EXACT FormData implementation as per Vepaar documentation
      const formData = new FormData();
      formData.append('otp', otp);
      formData.append('mobileNumberWithCallingCode', mobileNumberWithCallingCode);

      // Make API call exactly as specified
      const response = await axios.post(this.VEPAAR_API_URL, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 30000, // 30 seconds timeout
      });

      this.logger.log(`✅ Vepaar API Response:`, {
        status: response.status,
        statusText: response.statusText,
        data: response.data
      });

      // Check for successful response
      if (response.status === 200 || response.status === 201) {
        this.logger.log(`✅ OTP sent successfully to ${mobileNumberWithCallingCode}`);
        return true;
      } else {
        this.logger.error(`❌ Vepaar API returned status: ${response.status}`);
        return false;
      }

    } catch (error: any) {
      this.logger.error('❌ Vepaar API Error:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          timeout: error.config?.timeout
        }
      });

      // Log the exact request that was sent for debugging
      this.logger.error('❌ Failed request details:', {
        url: this.VEPAAR_API_URL,
        phoneNumber: `${countryCode}${phoneNumber}`,
        otpLength: otp.length
      });

      return false;
    }
  }

  // Verify OTP
  async verifyOTP(
    phoneNumber: string, 
    countryCode: string, 
    enteredOTP: string
  ): Promise<boolean> {
    try {
      this.logger.log(`🔍 Verifying OTP for +${countryCode}${phoneNumber}: ${enteredOTP}`);

      const result = this.otpStorage.validateOTP(phoneNumber, countryCode, enteredOTP);
      
      if (!result.valid) {
        throw new BadRequestException(result.message);
      }

      // Clear rate limit on successful verification
      this.otpStorage.clearRateLimit(phoneNumber, countryCode);

      this.logger.log(`✅ OTP verified successfully for +${countryCode}${phoneNumber}`);
      return true;

    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException('OTP verification failed. Please try again.');
    }
  }

  // Resend OTP
  async resendOTP(
    phoneNumber: string, 
    countryCode: string
  ): Promise<{ success: boolean; message: string; otp?: string }> {
    this.logger.log(`🔄 Resending OTP for +${countryCode}${phoneNumber}`);
    return await this.sendOTP(phoneNumber, countryCode);
  }

  // Test Vepaar API with your phone number
  async testVepaarConnection(testPhoneNumber?: string): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      // Use provided test number or default
      const phoneNumber = testPhoneNumber || '9999999999';
      const countryCode = '91';
      const testOTP = this.generateOTP();

      this.logger.log(`🧪 Testing Vepaar API with ${countryCode}${phoneNumber}`);

      const success = await this.sendVepaarOTP(phoneNumber, countryCode, testOTP);

      return {
        success,
        message: success 
          ? `Vepaar API test successful! OTP sent to +${countryCode}${phoneNumber}` 
          : 'Vepaar API test failed - check logs for details',
        details: {
          testNumber: `+${countryCode}${phoneNumber}`,
          testOTP,
          endpoint: this.VEPAAR_API_URL,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error: any) {
      return {
        success: false,
        message: 'Vepaar API test failed',
        details: {
          error: error.message,
          endpoint: this.VEPAAR_API_URL
        }
      };
    }
  }

  // Get detailed debug info
  getDebugInfo() {
    return {
      vepaarEndpoint: this.VEPAAR_API_URL,
      nodeEnv: this.configService.get('NODE_ENV'),
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }
}
