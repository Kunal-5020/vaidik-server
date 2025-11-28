// src/admin/features/payments/dto/process-wallet-refund.dto.ts
import { IsNumber, IsString, IsNotEmpty, Min, MaxLength } from 'class-validator';

export class ProcessWalletRefundDto {
  @IsNumber()
  @Min(1)
  amountApproved: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  paymentReference: string;
}
