// src/admin/features/orders/dto/refund-order.dto.ts
import {
  IsNumber,
  IsString,
  IsNotEmpty,
  Min,
  MaxLength,
  IsOptional
} from 'class-validator';

export class RefundOrderDto {
  @IsOptional()
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(1, { message: 'Amount must be at least 1' })
  amount?: number;

  @IsString({ message: 'Reason must be a string' })
  @IsNotEmpty({ message: 'Reason is required' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason: string;
}
