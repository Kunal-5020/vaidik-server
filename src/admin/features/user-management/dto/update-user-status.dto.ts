// src/admin/features/user-management/dto/update-user-status.dto.ts
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserStatusDto {
  @IsEnum(['active', 'blocked', 'deleted', 'suspended'], {
    message: 'Status must be active, blocked, deleted, or suspended',
  })
  @IsNotEmpty({ message: 'Status is required' })
  status: string;

  @IsOptional()
  @IsString({ message: 'Reason must be a string' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason?: string;
}
