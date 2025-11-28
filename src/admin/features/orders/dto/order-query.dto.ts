// src/admin/features/orders/dto/order-query.dto.ts
import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
} from 'class-validator';

export class OrderQueryDto {
  @IsOptional()
  @IsEnum(['pending', 'waiting', 'waiting_in_queue', 'active', 'completed', 'cancelled', 'refund_requested', 'refunded'])
  status?: string;

  @IsOptional()
  @IsEnum(['chat', 'call', 'video_call', 'report'])
  type?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  astrologerId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
