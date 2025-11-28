// src/admin/features/auth/dto/admin-login.dto.ts
import { IsEmail, IsString, IsNotEmpty, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;
}
