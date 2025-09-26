import { IsOptional, IsString, IsEnum, IsDateString, Length, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  @Length(2, 50, { message: 'Name must be between 2 and 50 characters' })
  name?: string;

  @IsOptional()
  @IsEnum(['male', 'female', 'other'], { message: 'Gender must be male, female, or other' })
  gender?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date of birth must be a valid date' })
  dateOfBirth?: string;

  @IsOptional()
  @IsString({ message: 'Time of birth must be a string' })
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, { 
    message: 'Time of birth must be in HH:MM format' 
  })
  timeOfBirth?: string;

  @IsOptional()
  @IsString({ message: 'Place of birth must be a string' })
  @Length(2, 100, { message: 'Place of birth must be between 2 and 100 characters' })
  placeOfBirth?: string;

  @IsOptional()
  @IsString({ message: 'Current address must be a string' })
  @Length(5, 200, { message: 'Current address must be between 5 and 200 characters' })
  currentAddress?: string;

  @IsOptional()
  @IsString({ message: 'City must be a string' })
  @Length(2, 50, { message: 'City must be between 2 and 50 characters' })
  city?: string;

  @IsOptional()
  @IsString({ message: 'State must be a string' })
  @Length(2, 50, { message: 'State must be between 2 and 50 characters' })
  state?: string;

  @IsOptional()
  @IsString({ message: 'Country must be a string' })
  @Length(2, 50, { message: 'Country must be between 2 and 50 characters' })
  country?: string;

  @IsOptional()
  @IsString({ message: 'Pincode must be a string' })
  @Matches(/^[1-9][0-9]{5}$/, { message: 'Pincode must be a valid 6-digit Indian pincode' })
  pincode?: string;
}
