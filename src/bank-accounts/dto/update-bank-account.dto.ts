// src/bank-accounts/dto/update-bank-account.dto.ts

import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class UpdateBankAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountHolderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  branchName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/, {
    message: 'Invalid UPI ID format',
  })
  upiId?: string;
}