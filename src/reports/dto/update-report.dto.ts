import {
  IsString,
  IsEnum,
  IsOptional,
  MaxLength
} from 'class-validator';

export class UpdateReportDto {
  @IsOptional()
  @IsString({ message: 'Content must be a string' })
  content?: string;

  @IsOptional()
  @IsEnum(['pending', 'in_progress', 'completed', 'failed'], {
    message: 'Invalid status'
  })
  status?: string;

  @IsOptional()
  @IsString({ message: 'Astrologer notes must be a string' })
  @MaxLength(1000, { message: 'Notes cannot exceed 1000 characters' })
  astrologerNotes?: string;

  @IsOptional()
  @IsString({ message: 'Failure reason must be a string' })
  @MaxLength(500, { message: 'Failure reason cannot exceed 500 characters' })
  failureReason?: string;
}
