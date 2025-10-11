import {
  IsOptional,
  IsArray,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max
} from 'class-validator';
import { Type } from 'class-transformer';

export class SearchAstrologersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(50, { message: 'Limit cannot exceed 50' })
  limit?: number = 20;

  @IsOptional()
  @IsArray({ message: 'Specializations must be an array' })
  specializations?: string[];

  @IsOptional()
  @IsArray({ message: 'Languages must be an array' })
  languages?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'minRating must be a number' })
  @Min(0, { message: 'minRating must be at least 0' })
  @Max(5, { message: 'minRating cannot exceed 5' })
  minRating?: number;

  @IsOptional()
  @IsBoolean({ message: 'isOnline must be a boolean' })
  isOnline?: boolean;

  @IsOptional()
  @IsEnum(['rating', 'experience', 'price'], {
    message: 'sortBy must be rating, experience, or price'
  })
  sortBy?: 'rating' | 'experience' | 'price';
}
