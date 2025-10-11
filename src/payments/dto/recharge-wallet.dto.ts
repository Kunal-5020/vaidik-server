import { IsNumber, IsString, IsNotEmpty, Min, IsEnum, IsOptional } from 'class-validator';

export class RechargeWalletDto {
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(100, { message: 'Minimum recharge amount is ₹100' })
  amount: number;

  @IsEnum(['razorpay', 'stripe', 'paypal'], {
    message: 'Payment gateway must be razorpay, stripe, or paypal'
  })
  @IsNotEmpty({ message: 'Payment gateway is required' })
  paymentGateway: string;

  @IsOptional()
  @IsString()
  currency?: string; // 'INR', 'USD', 'EUR', etc.
}
