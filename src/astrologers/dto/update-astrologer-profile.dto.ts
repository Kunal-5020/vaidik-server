import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  MinLength,
  MaxLength,
  Min,
  Max
} from 'class-validator';

export class UpdateAstrologerProfileDto {
  @IsOptional()
  @IsString({ message: 'Bio must be a string' })
  @MinLength(50, { message: 'Bio must be at least 50 characters' })
  @MaxLength(1000, { message: 'Bio cannot exceed 1000 characters' })
  bio?: string;

  @IsOptional()
  @IsString({ message: 'Profile picture must be a string (URL)' })
  profilePicture?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Chat rate must be a number' })
  @Min(10, { message: 'Chat rate must be at least ₹10 per minute' })
  @Max(1000, { message: 'Chat rate cannot exceed ₹1000 per minute' })
  chatRate?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Call rate must be a number' })
  @Min(10, { message: 'Call rate must be at least ₹10 per minute' })
  @Max(1000, { message: 'Call rate cannot exceed ₹1000 per minute' })
  callRate?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Video call rate must be a number' })
  @Min(10, { message: 'Video call rate must be at least ₹10 per minute' })
  @Max(1000, { message: 'Video call rate cannot exceed ₹1000 per minute' })
  videoCallRate?: number;

  @IsOptional()
  @IsBoolean({ message: 'Chat enabled must be a boolean' })
  isChatEnabled?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'Call enabled must be a boolean' })
  isCallEnabled?: boolean;
}
