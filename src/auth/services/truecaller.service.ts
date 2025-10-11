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
  userProfile?: TruecallerUserProfile;
  message?: string;
}

@Injectable()
export class TruecallerService {
  private readonly logger = new Logger(TruecallerService.name);
  private readonly clientId: string;
  private readonly tokenEndpoint: string;
  private readonly userInfoEndpoint: string;

  // ✅ Comprehensive country code mapping
  private readonly countryCodeMap: { [key: string]: string } = {
    // Major countries
    IN: '91',   // India
    US: '1',    // United States
    CA: '1',    // Canada
    GB: '44',   // United Kingdom
    AU: '61',   // Australia
    NZ: '64',   // New Zealand
    
    // European countries
    DE: '49',   // Germany
    FR: '33',   // France
    IT: '39',   // Italy
    ES: '34',   // Spain
    NL: '31',   // Netherlands
    BE: '32',   // Belgium
    CH: '41',   // Switzerland
    AT: '43',   // Austria
    SE: '46',   // Sweden
    NO: '47',   // Norway
    DK: '45',   // Denmark
    FI: '358',  // Finland
    PL: '48',   // Poland
    
    // Asian countries
    CN: '86',   // China
    JP: '81',   // Japan
    KR: '82',   // South Korea
    TH: '66',   // Thailand
    VN: '84',   // Vietnam
    PH: '63',   // Philippines
    ID: '62',   // Indonesia
    MY: '60',   // Malaysia
    SG: '65',   // Singapore
    PK: '92',   // Pakistan
    BD: '880',  // Bangladesh
    LK: '94',   // Sri Lanka
    NP: '977',  // Nepal
    
    // Middle East
    AE: '971',  // UAE
    SA: '966',  // Saudi Arabia
    QA: '974',  // Qatar
    KW: '965',  // Kuwait
    OM: '968',  // Oman
    BH: '973',  // Bahrain
    IL: '972',  // Israel
    TR: '90',   // Turkey
    
    // African countries
    ZA: '27',   // South Africa
    NG: '234',  // Nigeria
    KE: '254',  // Kenya
    EG: '20',   // Egypt
    
    // South American countries
    BR: '55',   // Brazil
    AR: '54',   // Argentina
    MX: '52',   // Mexico
    CL: '56',   // Chile
    CO: '57',   // Colombia
  };

  constructor(private configService: ConfigService) {
    this.clientId =
      this.configService.get<string>('TRUECALLER_CLIENT_ID') ??
      'roh4kmkkmy2bvkuq_5pa2rx72ouwa88cwtrbogsqc0g';

    this.tokenEndpoint = 'https://oauth-account-noneu.truecaller.com/v1/token';
    this.userInfoEndpoint = 'https://oauth-account-noneu.truecaller.com/v1/userinfo';

    this.logger.log('✅ TruecallerService initialized');
  }

  async verifyOAuthCode(
    authorizationCode: string,
    codeVerifier: string
  ): Promise<TruecallerVerifyResponse> {
    if (!this.clientId) {
      this.logger.error('❌ Truecaller client ID not configured');
      return {
        success: false,
        message: 'Truecaller client ID not configured',
      };
    }

    try {
      this.logger.log('🔐 Step 1: Exchanging authorization code for access token...');

      const tokenResponse = await this.exchangeCodeForToken(
        authorizationCode,
        codeVerifier
      );

      this.logger.log('✅ Step 1 completed: Access token received');

      this.logger.log('📤 Step 2: Fetching user info from /userinfo endpoint...');

      const userProfile = await this.getUserInfo(tokenResponse.access_token);

      this.logger.log('✅ Step 2 completed: User info received', {
        phoneNumber: userProfile.phoneNumber,
        name: `${userProfile.firstName} ${userProfile.lastName}`.trim(),
      });

      return {
        success: true,
        userProfile,
        message: 'Truecaller verification successful',
      };
    } catch (error) {
      this.logger.error('❌ Truecaller verification failed:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });

      return {
        success: false,
        message: `Verification failed: ${error.message}`,
      };
    }
  }

  private async exchangeCodeForToken(
    authorizationCode: string,
    codeVerifier: string
  ) {
    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('client_id', this.clientId);
      params.append('code', authorizationCode);
      params.append('code_verifier', codeVerifier);

      this.logger.log('📤 Sending token exchange request...');

      const response = await axios.post(this.tokenEndpoint, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      });

      this.logger.log('✅ Token exchange successful');
      return response.data;
    } catch (error) {
      this.logger.error('❌ Token exchange failed:', {
        status: error.response?.status,
        message: error.response?.data?.error || error.message,
        details: error.response?.data,
      });

      throw new BadRequestException(
        error.response?.data?.error_description ||
          'Invalid authorization code. Please try again.'
      );
    }
  }

  /**
   * Fetch user info from Truecaller /userinfo endpoint
   * Example response:
   * {
   *   "phone_number": "918287805020",
   *   "phone_number_country_code": "IN",
   *   "given_name": "Kunal",
   *   "family_name": "Bhadana"
   * }
   */
  private async getUserInfo(accessToken: string): Promise<TruecallerUserProfile> {
    try {
      this.logger.log('📤 Fetching user info from /userinfo endpoint...');

      const response = await axios.get(this.userInfoEndpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 10000,
      });

      const userInfo = response.data;
      this.logger.log('📥 Raw userinfo response:', userInfo);

      // Extract data
      const phoneNumber = userInfo.phone_number || userInfo.phoneNumber;
      const isoCountryCode = userInfo.phone_number_country_code || userInfo.countryCode; // "IN"
      const firstName = userInfo.given_name || userInfo.firstName || 'User';
      const lastName = userInfo.family_name || userInfo.lastName || '';

      if (!phoneNumber) {
        this.logger.error('❌ No phone number in userinfo response:', userInfo);
        throw new BadRequestException('Phone number not found in Truecaller response');
      }

      // Convert ISO country code to numeric code
      const numericCountryCode = this.convertCountryCode(isoCountryCode);

      // Format phone number
      const formattedPhone = this.formatPhoneNumber(phoneNumber, numericCountryCode);

      this.logger.log('✅ User info parsed successfully:', {
        rawPhone: phoneNumber,
        isoCountryCode: isoCountryCode,
        numericCountryCode: numericCountryCode,
        formattedPhone: formattedPhone,
        firstName,
        lastName,
      });

      return {
        phoneNumber: formattedPhone,
        countryCode: numericCountryCode,
        firstName: firstName || 'User',
        lastName: lastName || '',
      };
    } catch (error) {
      this.logger.error('❌ UserInfo fetch failed:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        message: error.message,
        data: error.response?.data,
      });

      if (error.response?.status === 401) {
        throw new BadRequestException('Invalid or expired access token');
      } else if (error.response?.status === 404) {
        throw new BadRequestException('User profile not found');
      } else if (error.response?.status === 422) {
        throw new BadRequestException('OpenID scope missing in initial request');
      }

      throw new BadRequestException(
        'Failed to fetch user info from Truecaller. Please try again.'
      );
    }
  }

  /**
   * Convert ISO country code (IN, US, etc.) to numeric code (91, 1, etc.)
   */
  private convertCountryCode(isoCode: string): string {
    if (!isoCode) {
      this.logger.warn('⚠️ No country code provided, defaulting to India (91)');
      return '91';
    }

    const upperCode = isoCode.toUpperCase();
    const numericCode = this.countryCodeMap[upperCode];

    if (!numericCode) {
      this.logger.warn(`⚠️ Unknown country code: ${upperCode}, defaulting to India (91)`);
      return '91';
    }

    this.logger.log(`✅ Converted country code: ${upperCode} → ${numericCode}`);
    return numericCode;
  }

  /**
   * Format phone number with country code
   * Input: "918287805020" (already has country code)
   * Output: "+918287805020"
   */
  private formatPhoneNumber(phoneNumber: string, countryCode: string): string {
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/[^\d]/g, '');

    this.logger.log('📊 Formatting phone:', {
      original: phoneNumber,
      cleaned: cleaned,
      countryCode: countryCode,
    });

    // Check if phone already starts with country code
    if (cleaned.startsWith(countryCode)) {
      // Phone already has country code, just add +
      this.logger.log('✅ Phone already has country code');
      return `+${cleaned}`;
    } else {
      // Add country code
      this.logger.log('✅ Adding country code to phone');
      return `+${countryCode}${cleaned}`;
    }
  }

  isTruecallerEnabled(): boolean {
    return !!this.clientId;
  }

  getTruecallerConfig() {
    return {
      clientId: this.clientId,
      isEnabled: this.isTruecallerEnabled(),
      flowType: 'oauth',
      dataFields: ['phoneNumber', 'firstName', 'lastName', 'countryCode'],
      note: 'Uses OAuth /userinfo endpoint with country code mapping',
    };
  }

  async testConfiguration() {
    const config = this.getTruecallerConfig();

    return {
      success: this.isTruecallerEnabled(),
      message: this.isTruecallerEnabled()
        ? 'Truecaller is configured and ready'
        : 'Truecaller client ID not configured',
      config: {
        isEnabled: config.isEnabled,
        flowType: config.flowType,
        hasClientId: !!this.clientId,
        note: 'Uses standard OAuth /userinfo endpoint with ISO to numeric country code conversion',
      },
    };
  }
}
