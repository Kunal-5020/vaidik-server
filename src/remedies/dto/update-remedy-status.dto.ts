import {
  IsEnum,
  IsString,
  IsOptional,
  MaxLength
} from 'class-validator';

export class UpdateRemedyStatusDto {
  @IsEnum(['accepted', 'rejected'], {
    message: 'Status must be either accepted or rejected'
  })
  status: 'accepted' | 'rejected';

  @IsOptional()
  @IsString({ message: 'Notes must be a string' })
  @MaxLength(500, { message: 'Notes cannot exceed 500 characters' })
  notes?: string;
}
