import {
  IsOptional,
  IsArray,
  IsString,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsIn
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export enum SortByOption {
  POPULARITY = 'popularity',
  EXP_HIGH_LOW = 'exp-high-low',
  EXP_LOW_HIGH = 'exp-low-high',
  ORDERS_HIGH_LOW = 'orders-high-low',
  ORDERS_LOW_HIGH = 'orders-low-high',
  PRICE_HIGH_LOW = 'price-high-low',
  PRICE_LOW_HIGH = 'price-low-high',
  RATING_HIGH_LOW = 'rating-high-low',
}

export enum TopAstrologerTier {
  CELEBRITY = 'celebrity',
  TOP_CHOICE = 'top-choice',
  RISING_STAR = 'rising-star',
  ALL = 'all',
}

export enum GenderOption {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export enum CountryOption {
  INDIA = 'india',
  OUTSIDE_INDIA = 'outside-india',
}

export class SearchAstrologersDto {
  // Pagination
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

  // Text search
  @IsOptional()
  @IsString({ message: 'Search query must be a string' })
  @Transform(({ value }) => value?.trim())
  search?: string;

  // Sort by
  @IsOptional()
  @IsEnum(SortByOption, {
    message: 'Invalid sort option'
  })
  sortBy?: SortByOption = SortByOption.POPULARITY;

  // Skills/Specializations (multiple selection)
  // ✅ FIX: Handle both string and array from query params
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').map(s => s.trim());
    return undefined;
  })
  @IsArray({ message: 'Skills must be an array' })
  @IsString({ each: true, message: 'Each skill must be a string' })
  skills?: string[];

  // Languages (multiple selection)
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').map(s => s.trim());
    return undefined;
  })
  @IsArray({ message: 'Languages must be an array' })
  @IsString({ each: true, message: 'Each language must be a string' })
  languages?: string[];

  // Gender (multiple selection)
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').map(s => s.trim());
    return undefined;
  })
  @IsArray({ message: 'Genders must be an array' })
  @IsEnum(GenderOption, { each: true, message: 'Invalid gender option' })
  genders?: GenderOption[];

  // Country (multiple selection)
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').map(s => s.trim());
    return undefined;
  })
  @IsArray({ message: 'Countries must be an array' })
  @IsEnum(CountryOption, { each: true, message: 'Invalid country option' })
  countries?: CountryOption[];

  // Top Astrologers (multiple selection)
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return value.split(',').map(s => s.trim());
    return undefined;
  })
  @IsArray({ message: 'Top astrologers must be an array' })
  @IsEnum(TopAstrologerTier, { each: true, message: 'Invalid top astrologer tier' })
  topAstrologers?: TopAstrologerTier[];

  // Price range
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'minPrice must be a number' })
  @Min(0, { message: 'minPrice must be at least 0' })
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'maxPrice must be a number' })
  @Min(0, { message: 'maxPrice must be at least 0' })
  maxPrice?: number;

  // Rating
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'minRating must be a number' })
  @Min(0, { message: 'minRating must be at least 0' })
  @Max(5, { message: 'minRating cannot exceed 5' })
  minRating?: number;

  // Experience range
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'minExperience must be an integer' })
  @Min(0, { message: 'minExperience must be at least 0' })
  minExperience?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxExperience must be an integer' })
  @Min(0, { message: 'maxExperience must be at least 0' })
  maxExperience?: number;

  // Online status
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean({ message: 'isOnline must be a boolean' })
  isOnline?: boolean;

  // Live streaming status
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean({ message: 'isLive must be a boolean' })
  isLive?: boolean;

  // Service type filters
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean({ message: 'chatEnabled must be a boolean' })
  chatEnabled?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean({ message: 'callEnabled must be a boolean' })
  callEnabled?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean({ message: 'videoCallEnabled must be a boolean' })
  videoCallEnabled?: boolean;
}
