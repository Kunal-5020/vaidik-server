import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsEnum,
  IsOptional,
} from 'class-validator';

export class SuggestManualRemedyDto {
  @IsString({ message: 'Title must be a string' })
  @IsNotEmpty({ message: 'Title is required' })
  @MinLength(5, { message: 'Title must be at least 5 characters' })
  @MaxLength(200, { message: 'Title cannot exceed 200 characters' })
  title: string;

  @IsString({ message: 'Description must be a string' })
  @IsNotEmpty({ message: 'Description is required' })
  @MinLength(20, { message: 'Description must be at least 20 characters' })
  @MaxLength(1000, { message: 'Description cannot exceed 1000 characters' })
  description: string;

  @IsEnum(['gemstone', 'mantra', 'puja', 'donation', 'yantra', 'other'], {
    message: 'Invalid remedy type',
  })
  @IsNotEmpty({ message: 'Remedy type is required' })
  type: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  usageInstructions?: string;

  @IsString({ message: 'Recommendation reason must be a string' })
  @IsNotEmpty({ message: 'Recommendation reason is required' })
  @MinLength(10)
  recommendationReason: string;

  @IsOptional()
  @IsEnum(['call', 'chat'])
  suggestedInChannel?: 'call' | 'chat';
}
