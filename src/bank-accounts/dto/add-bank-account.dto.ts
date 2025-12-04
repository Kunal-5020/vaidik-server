// src/bank-accounts/dto/add-bank-account.dto.ts

import {
  IsString,
  IsNotEmpty,
  Matches,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AddBankAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'Account holder name is required' })
  @MaxLength(100)
  accountHolderName: string;

  @IsString()
  @IsNotEmpty({ message: 'Account number is required' })
  @Matches(/^[0-9]{9,18}$/, {
    message: 'Account number must be 9-18 digits',
  })
  accountNumber: string;

  @IsString()
  @IsNotEmpty({ message: 'IFSC code is required' })
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, {
    message: 'Invalid IFSC code format (e.g., SBIN0001234)',
  })
  ifscCode: string;

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


