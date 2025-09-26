import { 
  Injectable, 
  BadRequestException, 
  HttpException, 
  HttpStatus 
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
  private readonly VEPAAR_API_URL = 'https://api.vepaar.com/api/v1/send-otp';

  constructor(
    private configService: ConfigService,
    private otpStorage: OtpStorageService,
  ) {}

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

  // Send OTP
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
      
      console.log(`🔐 Generated OTP: ${otp} for +${countryCode}${phoneNumber}`);
      
      // Store OTP
      this.otpStorage.storeOTP(phoneNumber, countryCode, otp, 10); // 10 minutes

      // Send via Vepaar API (skip in development)
      if (this.configService.get('NODE_ENV') === 'production') {
        const mobileNumberWithCallingCode = `${countryCode}${phoneNumber}`;
        const formData = new FormData();
        formData.append('otp', otp);
        formData.append('mobileNumberWithCallingCode', mobileNumberWithCallingCode);

        try {
          const response = await axios.post(this.VEPAAR_API_URL, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
              ...formData.getHeaders(),
            },
            timeout: 10000,
          });
          console.log(`✅ Vepaar API Response:`, response.status);
        } catch (apiError: any) {
          console.error('❌ Vepaar API Error:', apiError.message);
          // Don't fail the OTP generation if API fails
        }
      }

      return {
        success: true,
        message: 'OTP sent to your WhatsApp',
        ...(this.configService.get('NODE_ENV') === 'development' && { otp })
      };

    } catch (error) {
      console.error('❌ OTP Send Error:', error);
      
      if (error instanceof TooManyRequestsException || error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Failed to send OTP. Please try again.');
    }
  }

  // Verify OTP
  async verifyOTP(
    phoneNumber: string, 
    countryCode: string, 
    enteredOTP: string
  ): Promise<boolean> {
    try {
      console.log(`🔍 Verifying OTP for +${countryCode}${phoneNumber}: ${enteredOTP}`);
      
      // Debug: show all stored OTPs
      console.log('🔍 Debug stored OTPs:', this.otpStorage.getStoredOTPs());

      const result = this.otpStorage.validateOTP(phoneNumber, countryCode, enteredOTP);
      
      if (!result.valid) {
        throw new BadRequestException(result.message);
      }

      // Clear rate limit on successful verification
      this.otpStorage.clearRateLimit(phoneNumber, countryCode);

      console.log(`✅ OTP verified successfully for +${countryCode}${phoneNumber}`);
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
    // For simplicity, just call sendOTP again
    // Rate limiting is handled in sendOTP method
    return await this.sendOTP(phoneNumber, countryCode);
  }
}
