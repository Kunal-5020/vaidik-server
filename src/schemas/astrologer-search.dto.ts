import { 
  IsOptional, 
  IsString, 
  IsArray, 
  IsNumber, 
  IsEnum,
  Min,
  Max
} from 'class-validator';

export class AstrologerSearchDto {
  @IsOptional()
  @IsString({ message: 'Search query must be a string' })
  search?: string;

  @IsOptional()
  @IsArray({ message: 'Specializations must be an array' })
  @IsString({ each: true, message: 'Each specialization must be a string' })
  specializations?: string[];

  @IsOptional()
  @IsArray({ message: 'Languages must be an array' })
  @IsString({ each: true, message: 'Each language must be a string' })
  languages?: string[];

  @IsOptional()
  @IsNumber({}, { message: 'Min price must be a number' })
  @Min(0, { message: 'Min price cannot be negative' })
  minPrice?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Max price must be a number' })
  @Max(1000, { message: 'Max price cannot exceed ₹1000' })
  maxPrice?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Min rating must be a number' })
  @Min(1, { message: 'Min rating must be at least 1' })
  @Max(5, { message: 'Min rating cannot exceed 5' })
  minRating?: number;

  @IsOptional()
  @IsEnum(['online', 'all'], { message: 'Status must be either online or all' })
  status?: string;

  @IsOptional()
  @IsEnum(['rating', 'price_low', 'price_high', 'experience'], {
    message: 'Sort by must be rating, price_low, price_high, or experience'
  })
  sortBy?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Page must be a number' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Limit must be a number' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(50, { message: 'Limit cannot exceed 50' })
  limit?: number;
}
