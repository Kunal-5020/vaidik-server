import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class UpdatePricingDto {
  @IsOptional()
  @IsNumber({}, { message: 'Chat rate must be a number' })
  @Min(10, { message: 'Chat rate must be at least ₹10 per minute' })
  @Max(1000, { message: 'Chat rate cannot exceed ₹1000 per minute' })
  chatRate?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Call rate must be a number' })
  @Min(10, { message: 'Call rate must be at least ₹10 per minute' })
  @Max(1000, { message: 'Call rate cannot exceed ₹1000 per minute' })
  callRate?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Video call rate must be a number' })
  @Min(10, { message: 'Video call rate must be at least ₹10 per minute' })
  @Max(1000, { message: 'Video call rate cannot exceed ₹1000 per minute' })
  videoCallRate?: number;
}
