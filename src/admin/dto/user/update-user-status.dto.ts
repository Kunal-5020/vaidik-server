// src/admin/dto/user/update-user-status.dto.ts
import { IsEnum, IsString, IsNotEmpty, IsOptional } from 'class-validator';

export enum UserActionStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BANNED = 'banned',
}

export class UpdateUserStatusDto {
  @IsEnum(UserActionStatus, { message: 'Invalid status' })
  status: UserActionStatus;

  @IsOptional()
  @IsString({ message: 'Reason must be a string' })
  @IsNotEmpty({ message: 'Reason cannot be empty when provided' })
  reason?: string;
}
