// src/payments/dto/orders/create-order.dto.ts
import { IsEnum, IsNumber, IsOptional, IsString, Min, Max, IsMongoId } from 'class-validator';

export class CreateOrderDto {
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(1, { message: 'Minimum amount is ₹1' })
  @Max(50000, { message: 'Maximum amount is ₹50,000' })
  amount: number; // Amount in rupees

  @IsEnum(['wallet_recharge', 'call_payment', 'chat_payment', 'stream_tip'], {
    message: 'Invalid payment purpose'
  })
  purpose: 'wallet_recharge' | 'call_payment' | 'chat_payment' | 'stream_tip';

  @IsOptional()
  @IsMongoId({ message: 'Invalid astrologer ID' })
  astrologerId?: string;

  @IsOptional()
  @IsString({ message: 'Session ID must be a string' })
  sessionId?: string;

  @IsOptional()
  @IsString({ message: 'Notes must be a string' })
  notes?: string;
}
