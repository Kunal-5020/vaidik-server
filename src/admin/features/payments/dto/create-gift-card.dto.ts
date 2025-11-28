// src/admin/features/payments/dto/create-gift-card.dto.ts
import {
  IsString,
  IsNumber,
  IsNotEmpty,
  Min,
  Max,
  MaxLength,
  IsOptional,
  IsDateString,
  IsObject,
} from 'class-validator';

export class CreateGiftCardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @IsNumber()
  @Min(1)
  @Max(100000)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxRedemptions?: number;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
