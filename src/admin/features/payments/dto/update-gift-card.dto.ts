// src/admin/features/payments/dto/update-gift-card.dto.ts
import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateGiftCardDto {
  @IsEnum(['active', 'disabled', 'expired'])
  @IsNotEmpty()
  status: 'active' | 'disabled' | 'expired';
}
