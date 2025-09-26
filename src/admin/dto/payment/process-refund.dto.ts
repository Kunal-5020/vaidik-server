// src/admin/dto/payment/process-refund.dto.ts
import { 
  IsMongoId, 
  IsNumber, 
  IsString, 
  IsNotEmpty, 
  Min, 
  Max, 
  MinLength,
  MaxLength 
} from 'class-validator';

export class ProcessRefundDto {
  @IsMongoId({ message: 'Invalid transaction ID format' })
  transactionId: string;

  @IsNumber({}, { message: 'Refund amount must be a number' })
  @Min(1, { message: 'Refund amount must be greater than 0' })
  @Max(100000, { message: 'Refund amount cannot exceed ₹1,00,000' })
  amount: number;

  @IsString({ message: 'Reason must be a string' })
  @IsNotEmpty({ message: 'Refund reason is required' })
  @MinLength(10, { message: 'Reason must be at least 10 characters long' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason: string;
}
