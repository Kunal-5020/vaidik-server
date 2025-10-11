import { IsInt, IsString, IsOptional, Min, Max, IsNotEmpty, MaxLength } from 'class-validator';

export class AddReviewDto {
  @IsInt({ message: 'Rating must be an integer' })
  @Min(1, { message: 'Rating must be at least 1' })
  @Max(5, { message: 'Rating must be at most 5' })
  rating: number;

  @IsOptional()
  @IsString({ message: 'Review must be a string' })
  @MaxLength(500, { message: 'Review cannot exceed 500 characters' })
  review?: string;
}
