// src/auth/dto/verify-otp.dto.ts (Enhanced validation)
import { IsNotEmpty, IsString, Matches, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString({ message: 'Phone number must be a string' })
  @Length(10, 10, { message: 'Phone number must be exactly 10 digits' }) // ✅ More specific
  @Matches(/^[6-9]\d{9}$/, { 
    message: 'Phone number must be 10 digits starting with 6, 7, 8, or 9 (Indian mobile number format)'
  }) // ✅ Specific to Indian mobile numbers
  phoneNumber: string;

  @IsNotEmpty({ message: 'Country code is required' })
  @IsString({ message: 'Country code must be a string' })
  @Length(1, 4, { message: 'Country code must be 1-4 digits' })
  @Matches(/^(91|1|44|61|86|33|49|81|7|39|34|55)$/, { 
    message: 'Country code must be a valid international code (e.g., 91 for India, 1 for US/Canada)'
  }) // ✅ Specific valid country codes
  countryCode: string;

  @IsNotEmpty({ message: 'OTP is required' })
  @IsString({ message: 'OTP must be a string' })
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'OTP must contain only numbers' })
  otp: string;
}
