import { IsNumber, IsString, IsNotEmpty, Min, IsEnum, IsOptional } from 'class-validator';

export class RechargeWalletDto {
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(100, { message: 'Minimum recharge amount is ₹100' })
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string; // 'INR', 'USD', 'EUR', etc.
}
