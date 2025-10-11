import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsEnum,
  IsArray,
  IsBoolean
} from 'class-validator';

export class UpdateAdminDto {
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100, { message: 'Name cannot exceed 100 characters' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Phone number must be a string' })
  phoneNumber?: string;

  @IsOptional()
  @IsString({ message: 'Profile image must be a string' })
  profileImage?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive', 'suspended', 'locked'], {
    message: 'Invalid status',
  })
  status?: string;

  @IsOptional()
  @IsArray({ message: 'Custom permissions must be an array' })
  @IsString({ each: true })
  customPermissions?: string[];

  @IsOptional()
  @IsArray({ message: 'Denied permissions must be an array' })
  @IsString({ each: true })
  deniedPermissions?: string[];

  @IsOptional()
  @IsString({ message: 'Department must be a string' })
  department?: string;

  @IsOptional()
  @IsString({ message: 'Notes must be a string' })
  notes?: string;
}
