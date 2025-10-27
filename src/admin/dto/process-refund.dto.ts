// src/admin/dto/process-refund.dto.ts

import { 
  IsString, 
  IsNotEmpty, 
  IsEnum, 
  IsOptional, 
  MaxLength, 
  IsNumber, 
  Min, 
  Max 
} from 'class-validator';

export class ProcessRefundDto {
  @IsEnum(['approve', 'reject'], {
    message: 'Action must be either approve or reject'
  })
  @IsNotEmpty()
  action: 'approve' | 'reject';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  refundPercentage?: number; // Default 100% if not specified

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  rejectionReason?: string; // Required if action is 'reject'
}
