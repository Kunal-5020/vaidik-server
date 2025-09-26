// src/admin/dto/astrologer/suspend-astrologer.dto.ts
import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class SuspendAstrologerDto {
  @IsString({ message: 'Reason must be a string' })
  @IsNotEmpty({ message: 'Suspension reason is required' })
  @MinLength(10, { message: 'Reason must be at least 10 characters long' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason: string;
}
