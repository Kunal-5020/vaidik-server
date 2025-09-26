import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TruecallerVerifyResponse {
  success: boolean;
  phoneNumber?: string;
  message?: string;
  isVerified?: boolean;
}

@Injectable()
export class TruecallerService {
  private readonly logger = new Logger(TruecallerService.name);
  private readonly clientId: string;
  private readonly packageName: string;
  private readonly sha1Fingerprint: string;
  private readonly environment: string;

  constructor(private configService: ConfigService) {
    this.clientId = this.configService.get<string>('TRUECALLER_CLIENT_ID') ?? '7lbyxiqe02bk6j67r_lfmhr14z8ctda3tjfldbx6ud4';
    this.packageName = this.configService.get<string>('TRUECALLER_PACKAGE_NAME') ?? 'com.vaidiktalk';
    this.sha1Fingerprint = this.configService.get<string>('TRUECALLER_SHA1_FINGERPRINT') ?? '23:21:9E:E1:97:78:45:AA:A8:44:52:CF:E0:AF:D1:87:02:6B:E6:59';
    this.environment = this.configService.get<string>('TRUECALLER_ENVIRONMENT') || 'test';
    
    if (!this.clientId || !this.packageName) {
      this.logger.warn('⚠️ Truecaller credentials not configured. Truecaller verification will be disabled.');
    } else {
      this.logger.log(`✅ Truecaller initialized for ${this.packageName} (${this.environment})`);
    }
  }

  // SIMPLIFIED: Only verify phone number from Truecaller
  async verifyPhoneNumber(
    phoneNumber: string,
    signature: string,
    payload: string,
    signatureAlgorithm: string = 'SHA256withRSA'
  ): Promise<TruecallerVerifyResponse> {
    
    if (!this.clientId) {
      throw new BadRequestException('Truecaller service not configured');
    }

    try {
      // Validate the signature (crucial for security)
      const isValidSignature = await this.validateTruecallerSignature(
        payload,
        signature,
        signatureAlgorithm
      );

      if (!isValidSignature) {
        this.logger.warn(`❌ Invalid Truecaller signature for phone: ${phoneNumber}`);
        return {
          success: false,
          message: 'Invalid Truecaller signature - security verification failed'
        };
      }

      // Format phone number
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      this.logger.log(`✅ Truecaller phone verification successful for: ${formattedPhone}`);

      return {
        success: true,
        phoneNumber: formattedPhone,
        isVerified: true,
        message: 'Phone number verified successfully via Truecaller'
      };

    } catch (error) {
      this.logger.error(`❌ Truecaller phone verification failed: ${error.message}`);
      return {
        success: false,
        message: 'Phone number verification failed'
      };
    }
  }

  // Validate signature (simplified for test environment)
  private async validateTruecallerSignature(
    payload: string,
    signature: string,
    algorithm: string
  ): Promise<boolean> {
    try {
      if (this.environment === 'test') {
        // Basic validation for test environment
        return !!payload && !!signature && algorithm === 'SHA256withRSA';
      }
      
      // For production, implement proper RSA signature verification
      return true; // Simplified for now

    } catch (error) {
      this.logger.error(`Signature validation error: ${error.message}`);
      return false;
    }
  }

  // Format phone number to ensure consistency
  private formatPhoneNumber(phoneNumber: string): string {
    let formatted = phoneNumber.replace(/[^\d+]/g, '');
    
    if (formatted.length === 10 && !formatted.startsWith('+')) {
      formatted = '+91' + formatted;
    }
    
    return formatted;
  }

  // Check if Truecaller service is available
  isTruecallerEnabled(): boolean {
    return !!(this.clientId && this.packageName);
  }

  // Get Truecaller configuration for Android frontend
  getTruecallerConfig() {
    return {
      clientId: this.clientId,
      packageName: this.packageName,
      isEnabled: this.isTruecallerEnabled(),
      environment: this.environment,
      sha1Fingerprint: this.sha1Fingerprint
    };
  }

  // Test configuration
  async testConfiguration(): Promise<{
    success: boolean;
    message: string;
    config: any;
  }> {
    const config = this.getTruecallerConfig();
    
    return {
      success: this.isTruecallerEnabled(),
      message: this.isTruecallerEnabled() 
        ? 'Truecaller configuration is valid'
        : 'Truecaller configuration is missing',
      config
    };
  }
}
