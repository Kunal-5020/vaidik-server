// src/admin/dto/analytics/date-range-query.dto.ts
import { IsOptional, IsDateString } from 'class-validator';

export class DateRangeQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'Invalid start date format (YYYY-MM-DD)' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid end date format (YYYY-MM-DD)' })
  endDate?: string;
}
