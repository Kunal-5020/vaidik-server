// src/admin/features/astrologer-management/dto/reject-registration.dto.ts
import { IsString, IsNotEmpty, IsBoolean, IsOptional, MaxLength } from 'class-validator';

export class RejectRegistrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @IsOptional()
  @IsBoolean()
  canReapply?: boolean;
}
