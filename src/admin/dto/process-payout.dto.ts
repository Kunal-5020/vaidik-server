import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class ProcessPayoutDto {
  @IsString({ message: 'Transaction reference must be a string' })
  @IsNotEmpty({ message: 'Transaction reference is required' })
  @MaxLength(200, { message: 'Transaction reference cannot exceed 200 characters' })
  transactionReference: string;

  @IsOptional()
  @IsString({ message: 'Admin notes must be a string' })
  @MaxLength(500, { message: 'Admin notes cannot exceed 500 characters' })
  adminNotes?: string;
}
