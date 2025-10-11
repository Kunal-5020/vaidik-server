import {
  IsNumber,
  IsString,
  IsNotEmpty,
  Min,
  ValidateNested,
  Matches,
  IsOptional
} from 'class-validator';
import { Type } from 'class-transformer';

class BankDetails {
  @IsString({ message: 'Account holder name must be a string' })
  @IsNotEmpty({ message: 'Account holder name is required' })
  accountHolderName: string;

  @IsString({ message: 'Account number must be a string' })
  @IsNotEmpty({ message: 'Account number is required' })
  @Matches(/^[0-9]{9,18}$/, { message: 'Invalid account number format' })
  accountNumber: string;

  @IsString({ message: 'IFSC code must be a string' })
  @IsNotEmpty({ message: 'IFSC code is required' })
  @Matches(/^[A-Z]{4}0[A-Z0-9]{6}$/, { message: 'Invalid IFSC code format' })
  ifscCode: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  upiId?: string;
}

export class RequestPayoutDto {
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(500, { message: 'Minimum payout amount is ₹500' })
  amount: number;

  @ValidateNested()
  @Type(() => BankDetails)
  bankDetails: BankDetails;
}
