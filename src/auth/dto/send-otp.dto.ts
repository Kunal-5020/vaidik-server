import { IsNotEmpty, IsString, Matches, Length, IsOptional } from 'class-validator';

export class SendOtpDto {
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString({ message: 'Phone number must be a string' })
  @Length(10, 15, { message: 'Phone number must be between 10-15 digits' })
  @Matches(/^[0-9]+$/, { 
    message: 'Phone number must contain only numbers (without country code)' 
  })
  phoneNumber: string;

  @IsNotEmpty({ message: 'Country code is required' })
  @IsString({ message: 'Country code must be a string' })
  @Matches(/^[1-9]\d{0,3}$/, { 
    message: 'Country code must be 1-4 digits (e.g., 91 for India, 1 for US)' 
  })
  countryCode: string;
}
