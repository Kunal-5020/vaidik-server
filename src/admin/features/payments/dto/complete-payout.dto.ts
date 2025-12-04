// src/admin/features/payments/dto/complete-payout.dto.ts

import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CompletePayoutDto {
  @IsString()
  @IsNotEmpty()
  transactionReference: string;

  @IsString()
  @IsOptional()
  adminNotes?: string;
}
