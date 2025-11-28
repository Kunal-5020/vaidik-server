import { IsString, IsNotEmpty, IsEnum, IsOptional, IsMongoId, IsNumber, Min } from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  @IsEnum(['refund', 'payout', 'penalty', 'session', 'language', 'guidance', 'privacy', 'general'])
  category: string;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsOptional()
  @IsString()
  transactionId?: string;

  @IsOptional()
  @IsString()
  payoutId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  requestedAmount?: number;

  @IsOptional()
  metadata?: Record<string, any>;
}
