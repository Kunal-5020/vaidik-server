// src/admin/features/astrologer-management/dto/complete-interview.dto.ts
import { IsBoolean, IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';

export class CompleteInterviewDto {
  @IsBoolean({ message: 'Passed status must be a boolean' })
  passed: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  callDuration?: number;

  @IsOptional()
  @IsString()
  callSessionId?: string;
}
