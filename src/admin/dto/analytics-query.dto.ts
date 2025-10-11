import { IsDateString, IsOptional, IsEnum } from 'class-validator';

export class AnalyticsQueryDto {
  @IsDateString({}, { message: 'Invalid start date format' })
  startDate: string;

  @IsDateString({}, { message: 'Invalid end date format' })
  endDate: string;

  @IsOptional()
  @IsEnum(['day', 'week', 'month'], { message: 'Group by must be day, week, or month' })
  groupBy?: string;
}
