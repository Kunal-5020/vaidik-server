import {
  IsOptional,
  IsString,
  IsDateString,
  IsInt,
  Min,
  Max
} from 'class-validator';
import { Type } from 'class-transformer';

export class ActivityLogQueryDto {
  @IsOptional()
  @IsString({ message: 'Admin ID must be a string' })
  adminId?: string;

  @IsOptional()
  @IsString({ message: 'Action must be a string' })
  action?: string;

  @IsOptional()
  @IsString({ message: 'Module must be a string' })
  module?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid start date format' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid end date format' })
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number = 50;
}
