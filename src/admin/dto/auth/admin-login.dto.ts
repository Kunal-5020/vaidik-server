// src/admin/dto/auth/admin-login.dto.ts
import { IsEmail, IsString, MinLength, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class AdminLoginDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Transform(({ value }) => value?.toLowerCase())
  email: string;

  @IsString({ message: 'Password must be a string' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}
