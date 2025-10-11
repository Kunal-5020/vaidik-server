import { IsNumber, IsOptional, Min } from 'class-validator';

export class UpdatePricingDto {
  @IsOptional()
  @IsNumber({}, { message: 'Chat rate must be a number' })
  @Min(0, { message: 'Chat rate cannot be negative' })
  chatRatePerMinute?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Call rate must be a number' })
  @Min(0, { message: 'Call rate cannot be negative' })
  callRatePerMinute?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Video call rate must be a number' })
  @Min(0, { message: 'Video call rate cannot be negative' })
  videoCallRatePerMinute?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Report price must be a number' })
  @Min(0, { message: 'Report price cannot be negative' })
  reportPrice?: number;
}
