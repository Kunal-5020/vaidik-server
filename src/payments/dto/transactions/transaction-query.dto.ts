// src/payments/dto/transactions/transaction-query.dto.ts
import { IsOptional, IsEnum, IsDateString, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class TransactionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be greater than 0' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Limit must be an integer' })
  @Min(1, { message: 'Limit must be greater than 0' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number = 20;

  @IsOptional()
  @IsEnum(['credit', 'debit'], { message: 'Invalid transaction type' })
  type?: 'credit' | 'debit';

  @IsOptional()
  @IsEnum(['wallet_recharge', 'call_payment', 'chat_payment', 'stream_tip', 'refund', 'commission'], {
    message: 'Invalid transaction purpose'
  })
  purpose?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid start date format (YYYY-MM-DD)' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid end date format (YYYY-MM-DD)' })
  endDate?: string;
}
