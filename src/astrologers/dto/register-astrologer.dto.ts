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
  IsMongoId,
  IsUrl
} from 'class-validator';

export class RegisterAstrologerDto {
  @IsMongoId({ message: 'Invalid user ID format' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId: string;

  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name is required' })
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name cannot exceed 100 characters' })
  name: string;

  @IsDateString({}, { message: 'Invalid date of birth format' })
  @IsNotEmpty({ message: 'Date of birth is required' })
  dateOfBirth: string;

  @IsEnum(['male', 'female', 'other'], { message: 'Invalid gender' })
  @IsNotEmpty({ message: 'Gender is required' })
  gender: string;

  @IsArray({ message: 'Languages must be an array' })
  @ArrayMinSize(1, { message: 'At least one language is required' })
  @ArrayMaxSize(10, { message: 'Maximum 10 languages allowed' })
  @IsString({ each: true, message: 'Each language must be a string' })
  languagesKnown: string[];

  @IsArray({ message: 'Skills must be an array' })
  @ArrayMinSize(1, { message: 'At least one skill/expertise is required' })
  @ArrayMaxSize(15, { message: 'Maximum 15 skills allowed' })
  @IsString({ each: true, message: 'Each skill must be a string' })
  skills: string[];

  @IsString({ message: 'Profile picture must be a string (URL)' })
  @IsNotEmpty({ message: 'Profile picture is required' })
  @IsUrl({}, { message: 'Profile picture must be a valid URL' })
  profilePicture: string;

  @IsString({ message: 'Phone number must be a string' })
  @IsNotEmpty({ message: 'Phone number is required' })
  @Matches(/^(\+\d{10,15}|\d{10,15})$/, { message: 'Invalid phone number format' })
  phoneNumber: string;

  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsOptional()
  @IsString({ message: 'Bio must be a string' })
  @MaxLength(1000, { message: 'Bio cannot exceed 1000 characters' })
  bio?: string;
}
