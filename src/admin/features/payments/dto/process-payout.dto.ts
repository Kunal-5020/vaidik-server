// src/admin/features/payments/dto/process-payout.dto.ts
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class ProcessPayoutDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  transactionReference: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNotes?: string;
}
