// src/admin/dto/astrologer/reject-astrologer.dto.ts
import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class RejectAstrologerDto {
  @IsString({ message: 'Reason must be a string' })
  @IsNotEmpty({ message: 'Rejection reason is required' })
  @MinLength(10, { message: 'Reason must be at least 10 characters long' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason: string;
}
