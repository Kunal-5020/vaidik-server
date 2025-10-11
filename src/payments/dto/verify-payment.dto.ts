import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export class VerifyPaymentDto {
  @IsString({ message: 'Transaction ID must be a string' })
  @IsNotEmpty({ message: 'Transaction ID is required' })
  transactionId: string;

  @IsString({ message: 'Payment ID must be a string' })
  @IsNotEmpty({ message: 'Payment ID is required' })
  paymentId: string;

  @IsEnum(['completed', 'failed'], {
    message: 'Status must be either completed or failed'
  })
  status: 'completed' | 'failed';
}
