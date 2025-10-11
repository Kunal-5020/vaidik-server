import { IsBoolean, IsOptional, IsDateString } from 'class-validator';

export class UpdateAvailabilityDto {
  @IsOptional()
  @IsBoolean({ message: 'isOnline must be a boolean' })
  isOnline?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'isAvailable must be a boolean' })
  isAvailable?: boolean;

  @IsOptional()
  @IsDateString({}, { message: 'busyUntil must be a valid date' })
  busyUntil?: string;
}
