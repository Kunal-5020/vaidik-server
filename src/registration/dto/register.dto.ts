import {
  IsString,
  IsEmail,
  IsNotEmpty,
  IsArray,
  IsOptional,
  IsDateString,
  IsEnum,
  MinLength,
  MaxLength,
  ArrayMinSize,
  ArrayMaxSize,
  Matches,
  IsUrl,
  Length
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ description: 'Full name', example: 'Rajesh Kumar' })
  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name is required' })
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name cannot exceed 100 characters' })
  name: string;

  @ApiProperty({ description: 'Date of birth (YYYY-MM-DD)', example: '1990-05-15' })
  @IsDateString({}, { message: 'Invalid date of birth format (use YYYY-MM-DD)' })
  @IsNotEmpty({ message: 'Date of birth is required' })
  dateOfBirth: string;

  @ApiProperty({ enum: ['male', 'female', 'other'], example: 'male' })
  @IsEnum(['male', 'female', 'other'], { message: 'Gender must be male, female, or other' })
  @IsNotEmpty({ message: 'Gender is required' })
  gender: string;

  @ApiProperty({ 
    description: 'Languages known', 
    example: ['Hindi', 'English', 'Sanskrit'],
    isArray: true 
  })
  @IsArray({ message: 'Languages must be an array' })
  @ArrayMinSize(1, { message: 'At least one language is required' })
  @ArrayMaxSize(10, { message: 'Maximum 10 languages allowed' })
  @IsString({ each: true, message: 'Each language must be a string' })
  languagesKnown: string[];

  @ApiProperty({ 
    description: 'Skills/Expertise areas', 
    example: ['Vedic Astrology', 'Numerology', 'Tarot'],
    isArray: true 
  })
  @IsArray({ message: 'Skills must be an array' })
  @ArrayMinSize(1, { message: 'At least one skill/expertise is required' })
  @ArrayMaxSize(15, { message: 'Maximum 15 skills allowed' })
  @IsString({ each: true, message: 'Each skill must be a string' })
  skills: string[];

  @ApiProperty({ 
    description: 'Profile picture URL', 
    example: 'https://example.com/profile.jpg' 
  })
  @IsString({ message: 'Profile picture must be a string (URL)' })
  @IsNotEmpty({ message: 'Profile picture is required' })
  @IsUrl({}, { message: 'Profile picture must be a valid URL' })
  profilePicture: string;

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

  @ApiProperty({ description: 'Email address', example: 'rajesh@example.com' })
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({ 
    description: 'Short bio/description', 
    required: false,
    example: 'Experienced Vedic astrologer with 10 years of practice' 
  })
  @IsOptional()
  @IsString({ message: 'Bio must be a string' })
  @MaxLength(1000, { message: 'Bio cannot exceed 1000 characters' })
  bio?: string;
}
