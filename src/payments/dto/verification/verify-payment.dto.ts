// src/payments/dto/verification/verify-payment.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyPaymentDto {
  @IsString({ message: 'Order ID must be a string' })
  @IsNotEmpty({ message: 'Order ID is required' })
  razorpay_order_id: string;

  @IsString({ message: 'Payment ID must be a string' })
  @IsNotEmpty({ message: 'Payment ID is required' })
  razorpay_payment_id: string;

  @IsString({ message: 'Signature must be a string' })
  @IsNotEmpty({ message: 'Signature is required' })
  razorpay_signature: string;
}
