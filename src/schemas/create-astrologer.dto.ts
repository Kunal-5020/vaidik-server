import { 
  IsNotEmpty, 
  IsString, 
  IsArray, 
  IsNumber, 
  IsEnum, 
  IsOptional,
  Min,
  Max,
  Length,
  IsEmail,
  Matches
} from 'class-validator';

export class CreateAstrologerDto {
  @IsNotEmpty({ message: 'Name is required' })
  @IsString({ message: 'Name must be a string' })
  @Length(2, 100, { message: 'Name must be between 2 and 100 characters' })
  name: string;

  @IsOptional()
  @IsString({ message: 'Bio must be a string' })
  @Length(10, 500, { message: 'Bio must be between 10 and 500 characters' })
  bio?: string;

  @IsNotEmpty({ message: 'Experience years is required' })
  @IsNumber({}, { message: 'Experience years must be a number' })
  @Min(0, { message: 'Experience years cannot be negative' })
  @Max(50, { message: 'Experience years cannot exceed 50' })
  experienceYears: number;

  @IsNotEmpty({ message: 'Specializations are required' })
  @IsArray({ message: 'Specializations must be an array' })
  @IsString({ each: true, message: 'Each specialization must be a string' })
  specializations: string[];

  @IsNotEmpty({ message: 'Languages are required' })
  @IsArray({ message: 'Languages must be an array' })
  @IsString({ each: true, message: 'Each language must be a string' })
  languages: string[];

  @IsNotEmpty({ message: 'Chat pricing is required' })
  @IsNumber({}, { message: 'Chat pricing must be a number' })
  @Min(5, { message: 'Chat pricing must be at least ₹5 per minute' })
  @Max(1000, { message: 'Chat pricing cannot exceed ₹1000 per minute' })
  chatPrice: number;

  @IsNotEmpty({ message: 'Call pricing is required' })
  @IsNumber({}, { message: 'Call pricing must be a number' })
  @Min(5, { message: 'Call pricing must be at least ₹5 per minute' })
  @Max(1000, { message: 'Call pricing cannot exceed ₹1000 per minute' })
  callPrice: number;

  @IsOptional()
  @IsEmail({}, { message: 'Email must be valid' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'Phone number must be a string' })
  @Matches(/^[6-9]\d{9}$/, { message: 'Phone number must be a valid Indian mobile number' })
  phoneNumber?: string;

  @IsOptional()
  @IsString({ message: 'Country code must be a string' })
  countryCode?: string;
}
