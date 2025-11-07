// src/orders/dto/request-refund.dto.ts
import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class RequestRefundDto {
  @IsString({ message: 'Reason must be a string' })
  @IsNotEmpty({ message: 'Refund reason is required' })
  @MinLength(20, { message: 'Reason must be at least 20 characters' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason: string;
}
