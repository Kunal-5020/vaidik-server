import {
  IsString,
  IsNotEmpty,
  Matches,
  Length
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ 
    description: 'Phone number (without country code)', 
    example: '9876543210' 
  })
  @IsString({ message: 'Phone number must be a string' })
  @IsNotEmpty({ message: 'Phone number is required' })
  @Matches(/^[0-9]{7,15}$/, { 
    message: 'Phone number must contain only digits (7-15 characters)' 
  })
  phoneNumber: string;

  @ApiProperty({ 
    description: 'Country code (without + sign)', 
    example: '91',
    default: '91'
  })
  @IsString({ message: 'Country code must be a string' })
  @IsNotEmpty({ message: 'Country code is required' })
  @Length(1, 4, { message: 'Country code must be 1-4 digits' })
  @Matches(/^[0-9]+$/, { message: 'Country code must contain only digits' })
  countryCode: string = '91';

  @ApiProperty({ 
    description: '6-digit OTP', 
    example: '123456' 
  })
  @IsString({ message: 'OTP must be a string' })
  @IsNotEmpty({ message: 'OTP is required' })
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @Matches(/^[0-9]{6}$/, { message: 'OTP must be 6 digits' })
  otp: string;
}
