// src/admin/dto/auth/create-admin.dto.ts
import { 
  IsEmail, 
  IsString, 
  MinLength, 
  IsNotEmpty, 
  IsEnum, 
  IsOptional, 
  Matches 
} from 'class-validator';
import { Transform } from 'class-transformer';
import { AdminRole } from '../../enums/admin-role.enum';

export class CreateAdminDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Transform(({ value }) => value?.toLowerCase())
  email: string;

  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    { message: 'Password must contain uppercase, lowercase, number and special character' }
  )
  password: string;

  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name is required' })
  @MinLength(2, { message: 'Name must be at least 2 characters long' })
  name: string;

  @IsEnum(AdminRole, { message: 'Invalid admin role' })
  role: AdminRole;

  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Phone must be in international format (+1234567890)' })
  phone?: string;
}
