// src/admin/features/payments/dto/reject-payout.dto.ts
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class RejectPayoutDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
