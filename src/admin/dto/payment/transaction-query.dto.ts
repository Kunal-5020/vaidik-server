// src/admin/dto/payment/transaction-query.dto.ts
import { IsOptional, IsEnum, IsDateString, IsMongoId } from 'class-validator';
import { SearchQueryDto } from '../common/search-query.dto';

export enum TransactionType {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum TransactionPurpose {
  WALLET_RECHARGE = 'wallet_recharge',
  CALL_PAYMENT = 'call_payment',
  CHAT_PAYMENT = 'chat_payment',
  STREAM_TIP = 'stream_tip',
  REFUND = 'refund',
}

export class TransactionQueryDto extends SearchQueryDto {
  @IsOptional()
  @IsEnum(TransactionType, { message: 'Invalid transaction type' })
  type?: TransactionType;

  @IsOptional()
  @IsEnum(TransactionStatus, { message: 'Invalid transaction status' })
  status?: TransactionStatus;

  @IsOptional()
  @IsEnum(TransactionPurpose, { message: 'Invalid transaction purpose' })
  purpose?: TransactionPurpose;

  @IsOptional()
  @IsMongoId({ message: 'Invalid user ID format' })
  userId?: string;

  @IsOptional()
  @IsMongoId({ message: 'Invalid astrologer ID format' })
  astrologerId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid start date format (YYYY-MM-DD)' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Invalid end date format (YYYY-MM-DD)' })
  endDate?: string;
}
