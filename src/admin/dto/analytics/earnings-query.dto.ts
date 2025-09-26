// src/admin/dto/analytics/earnings-query.dto.ts
import { IsMongoId, IsOptional, IsEnum } from 'class-validator';
import { DateRangeQueryDto } from './date-range-query.dto';

export enum EarningsGroupBy {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class EarningsQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsMongoId({ message: 'Invalid astrologer ID format' })
  astrologerId?: string;

  @IsOptional()
  @IsEnum(EarningsGroupBy, { message: 'Invalid groupBy value' })
  groupBy?: EarningsGroupBy;
}
