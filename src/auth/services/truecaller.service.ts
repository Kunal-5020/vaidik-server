// src/auth/services/truecaller.service.ts

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface TruecallerUserProfile {
  phoneNumber: string;
  countryCode: string;
  firstName?: string;
  lastName?: string;
}

export interface TruecallerVerifyResponse {
  success: boolean;
  phoneNumber?: string;
  userProfile?: TruecallerUserProfile;
  message?: string;
  isVerified?: boolean;
}

@Injectable()
export class TruecallerService {
  private readonly logger = new Logger(TruecallerService.name);
  private readonly clientId: string;
  private readonly environment: string;
  private readonly tokenEndpoint: string;
  private readonly profileEndpoint: string;

  constructor(private configService: ConfigService) {
    this.clientId = this.configService.get<string>('TRUECALLER_CLIENT_ID') ?? '7lbyxiqe02bk6j67r_lfmhr14z8ctda3tjfldbx6ud4';
    this.environment = this.configService.get<string>('TRUECALLER_ENVIRONMENT') || 'production';
    
    this.tokenEndpoint = 'https://oauth-account-noneu.truecaller.com/v1/token';
    this.profileEndpoint = 'https://profile4-noneu.truecaller.com/v1/default';
    
    this.logger.log(`✅ Truecaller initialized (${this.environment}) - Phone + Name only`);
  }

  async verifyOAuthCode(
    authorizationCode: string,
    codeVerifier: string
  ): Promise<TruecallerVerifyResponse> {
    
    if (!this.clientId) {
      throw new BadRequestException('Truecaller service not configured');
    }

    try {
      this.logger.log('🔄 Step 1: Exchanging authorization code for access token...');
      
      const tokenResponse = await this.exchangeCodeForToken(authorizationCode, codeVerifier);
      
      this.logger.log('✅ Step 1 completed: Access token received');
      this.logger.log('🔄 Step 2: Fetching user profile (phone + name only)...');
      
      // Try to get profile, fallback to mock in development
      let userProfile: TruecallerUserProfile;
      
      try {
        userProfile = await this.getUserProfile(tokenResponse.access_token);
      } catch (profileError) {
        this.logger.warn('⚠️ Profile fetch failed', {
          error: profileError.message,
          status: profileError.response?.status
        });
        
        // Development fallback
        if (process.env.NODE_ENV === 'development' || this.environment === 'development') {
          this.logger.warn('🧪 Using mock profile (phone + name only)');
          
          userProfile = {
            phoneNumber: '+919876543210',
            countryCode: '91',
            firstName: 'Test',
            lastName: 'User'
          };
        } else {
          throw profileError;
        }
      }
      
      this.logger.log('✅ Step 2 completed: Profile received', {
        phoneNumber: userProfile.phoneNumber,
        name: `${userProfile.firstName || ''} ${userProfile.lastName || ''}`.trim()
      });

      return {
        success: true,
        phoneNumber: userProfile.phoneNumber,
        userProfile,
        isVerified: true,
        message: 'Phone verified via Truecaller'
      };

    } catch (error) {
      this.logger.error(`❌ Truecaller verification failed: ${error.message}`);
      
      return {
        success: false,
        message: `Verification failed: ${error.message}`
      };
    }
  }

  private async exchangeCodeForToken(authorizationCode: string, codeVerifier: string) {
    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('client_id', this.clientId);
      params.append('code', authorizationCode);
      params.append('code_verifier', codeVerifier);

      const response = await axios.post(this.tokenEndpoint, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      this.logger.error('❌ Token exchange failed:', error.response?.data);
      throw new BadRequestException('Token exchange failed');
    }
  }

  private async getUserProfile(accessToken: string): Promise<TruecallerUserProfile> {
    try {
      const response = await axios.get(this.profileEndpoint, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        timeout: 10000
      });

      const profile = response.data;

      // Extract phone and name only
      const phoneNumber = profile.phoneNumber || profile.phone_number;
      const firstName = profile.firstName || profile.first_name || profile.name;
      const lastName = profile.lastName || profile.last_name || '';
      
      if (!phoneNumber) {
        throw new BadRequestException('No phone number in response');
      }

      const formattedPhone = this.formatPhoneNumber(phoneNumber, profile.countryCode);

      return {
        phoneNumber: formattedPhone,
        countryCode: profile.countryCode || '91',
        firstName: firstName || 'User',
        lastName: lastName
      };

    } catch (error) {
      this.logger.error('❌ Profile fetch error:', {
        status: error.response?.status,
        message: error.message
      });
      throw error;
    }
  }

  private formatPhoneNumber(phoneNumber: string, countryCode?: string): string {
    let formatted = phoneNumber.replace(/[^\d+]/g, '');
    
    if (!formatted.startsWith('+')) {
      const code = countryCode || '91';
      formatted = `+${code}${formatted}`;
    }
    
    return formatted;
  }

  isTruecallerEnabled(): boolean {
    return !!this.clientId;
  }

  getTruecallerConfig() {
    return {
      clientId: this.clientId,
      isEnabled: this.isTruecallerEnabled(),
      environment: this.environment,
      flowType: 'oauth',
      dataFields: ['phoneNumber', 'name'] // Only these fields
    };
  }

  async testConfiguration() {
    const config = this.getTruecallerConfig();
    
    return {
      success: this.isTruecallerEnabled(),
      message: this.isTruecallerEnabled() 
        ? 'Truecaller ready (phone + name only)'
        : 'Truecaller not configured',
      config
    };
  }
}
