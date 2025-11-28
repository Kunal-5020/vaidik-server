// src/admin/features/orders/dto/cancel-order.dto.ts
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @IsString({ message: 'Reason must be a string' })
  @IsNotEmpty({ message: 'Reason is required' })
  @MaxLength(500, { message: 'Reason cannot exceed 500 characters' })
  reason: string;
}
