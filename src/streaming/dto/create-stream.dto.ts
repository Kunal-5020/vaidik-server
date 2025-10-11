import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  IsDateString,
  IsUrl,
  MinLength,
  MaxLength,
  Min
} from 'class-validator';

export class CreateStreamDto {
  @IsString({ message: 'Title must be a string' })
  @IsNotEmpty({ message: 'Title is required' })
  @MinLength(5, { message: 'Title must be at least 5 characters' })
  @MaxLength(200, { message: 'Title cannot exceed 200 characters' })
  title: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @MaxLength(1000, { message: 'Description cannot exceed 1000 characters' })
  description?: string;

  @IsEnum(['free', 'paid'], { message: 'Stream type must be free or paid' })
  streamType: 'free' | 'paid';

  @IsOptional()
  @IsNumber({}, { message: 'Entry fee must be a number' })
  @Min(0, { message: 'Entry fee cannot be negative' })
  entryFee?: number;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid scheduled date format' })
  scheduledAt?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Thumbnail must be a valid URL' })
  thumbnailUrl?: string;
}
