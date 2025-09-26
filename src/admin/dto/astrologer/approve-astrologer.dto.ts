// src/admin/dto/astrologer/approve-astrologer.dto.ts
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveAstrologerDto {
  @IsOptional()
  @IsString({ message: 'Notes must be a string' })
  @MaxLength(500, { message: 'Notes cannot exceed 500 characters' })
  notes?: string;
}
